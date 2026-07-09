import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export function generateTechnicalSheetPDF(): Buffer {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let yPos = 20;

  // Helper function to add section title
  const addSectionTitle = (title: string) => {
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(14);
    doc.setTextColor(59, 130, 246);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, yPos);
    yPos += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
  };

  // Helper function to add text
  const addText = (text: string, indent: number = 0) => {
    if (yPos > 270) {
      doc.addPage();
      yPos = 20;
    }
    const lines = doc.splitTextToSize(text, pageWidth - 28 - indent);
    doc.text(lines, 14 + indent, yPos);
    yPos += lines.length * 5;
  };

  // Header
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('MicroFlex', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Plateforme de Microfinance - Fiche Technique', pageWidth / 2, 30, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text(`Version 2.0 - ${new Date().toLocaleDateString('fr-FR')}`, pageWidth / 2, 38, { align: 'center' });

  yPos = 55;
  doc.setTextColor(0, 0, 0);

  // Section 1: Présentation
  addSectionTitle('1. PRÉSENTATION GÉNÉRALE');
  addText('MicroFlex est une plateforme complète de gestion de microfinance conçue pour la République du Congo.');
  addText('Elle offre une solution intégrée pour la gestion des crédits, épargnes, tontines, et opérations de caisse.');
  yPos += 5;

  // Section 2: Modules Fonctionnels
  addSectionTitle('2. MODULES FONCTIONNELS INTÉGRÉS');
  
  const modules = [
    ['Module', 'Description', 'Fonctionnalités clés'],
    ['Tableau de Bord', 'Vue d\'ensemble en temps réel', 'KPIs, graphiques, alertes, statistiques'],
    ['Gestion Clients', 'Base de données clients complète', 'KYC, scoring, segmentation, historique'],
    ['Crédits', 'Gestion des prêts', 'Demandes, approbations, échéanciers, remboursements'],
    ['Épargnes', 'Comptes d\'épargne', 'Dépôts, retraits, intérêts, historique'],
    ['Tontines', 'Groupes d\'épargne rotative', 'Membres, cotisations, tirages, calendrier'],
    ['Caisse', 'Opérations de caisse', 'Sessions, transactions, encaissements, décaissements'],
    ['Agent Terrain', 'Gestion des agents', 'Visites, collectes, GPS, performance'],
    ['Comptabilité', 'Comptabilité OHADA', 'Plan comptable, journaux, écritures, rapports'],
    ['Transferts', 'Transferts d\'argent', 'National, international, Mobile Money'],
    ['Bourse', 'Marché boursier', 'Cotations, portefeuille, ordres, analyse'],
    ['RH', 'Ressources humaines', 'Employés, contrats, présences, paie'],
    ['Rapports', 'Génération de rapports', 'PDF, Excel, graphiques, analyses'],
    ['Administration', 'Gestion du système', 'Utilisateurs, rôles, paramètres, logs'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [modules[0]],
    body: modules.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 50 } },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Section 3: Opérateurs Mobile Money
  addSectionTitle('3. OPÉRATEURS MOBILE MONEY INTÉGRÉS (15+)');
  
  const operators = [
    ['Opérateur', 'Pays', 'Type'],
    ['MTN Mobile Money', 'Congo, RDC, Cameroun', 'Mobile Money'],
    ['Orange Money', 'Congo, Sénégal, Côte d\'Ivoire', 'Mobile Money'],
    ['Airtel Money', 'Congo, RDC, Kenya', 'Mobile Money'],
    ['M-Pesa', 'Kenya, Tanzanie, RDC', 'Mobile Money'],
    ['Wave', 'Sénégal, Côte d\'Ivoire', 'Mobile Money'],
    ['Moov Money', 'Bénin, Côte d\'Ivoire', 'Mobile Money'],
    ['Free Money', 'Sénégal', 'Mobile Money'],
    ['Mobicash', 'Cameroun', 'Mobile Money'],
    ['Express Union', 'Cameroun, Congo', 'Transfert'],
    ['Western Union', 'International', 'Transfert international'],
    ['MoneyGram', 'International', 'Transfert international'],
    ['RIA', 'International', 'Transfert international'],
    ['WorldRemit', 'International', 'Transfert digital'],
    ['Sendwave', 'International', 'Transfert digital'],
    ['Afriland First Bank', 'CEMAC', 'Banque partenaire'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [operators[0]],
    body: operators.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [16, 185, 129], textColor: 255 },
    styles: { fontSize: 8, cellPadding: 2 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // New page for security
  doc.addPage();
  yPos = 20;

  // Section 4: Sécurité
  addSectionTitle('4. SÉCURITÉ BANCAIRE');
  
  const security = [
    ['Fonctionnalité', 'Description'],
    ['Chiffrement SSL/TLS', 'Communications sécurisées HTTPS'],
    ['Authentification', 'Sessions sécurisées avec bcrypt'],
    ['Rate Limiting', '500 req/15min API, 10 req/15min auth'],
    ['Politique mot de passe', 'Min 8 car., majuscules, chiffres, spéciaux'],
    ['Verrouillage compte', 'Après 5 tentatives échouées (15 min)'],
    ['Audit complet', 'Logs de toutes les opérations sensibles'],
    ['Headers sécurité', 'Helmet: CSP, HSTS, X-XSS-Protection'],
    ['Validation OTP', 'Double authentification Mobile Money'],
    ['KYC intégré', 'Vérification d\'identité clients'],
    ['Détection fraude', 'Algorithmes de détection automatique'],
    ['Conformité BEAC/CEMAC', 'Respect des normes régionales'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [security[0]],
    body: security.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [220, 38, 38], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 3 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Section 5: Architecture Technique
  addSectionTitle('5. ARCHITECTURE TECHNIQUE');
  
  const tech = [
    ['Composant', 'Technologie'],
    ['Frontend', 'React 18 + TypeScript'],
    ['UI Framework', 'Tailwind CSS + shadcn/ui + Radix UI'],
    ['Backend', 'Express.js + TypeScript'],
    ['Base de données', 'PostgreSQL avec Drizzle ORM'],
    ['Authentification', 'Sessions PostgreSQL + bcrypt'],
    ['State Management', 'React Query + Context API'],
    ['Build Tool', 'Vite'],
    ['Cartographie', 'Leaflet + OpenStreetMap'],
    ['PDF Export', 'jsPDF + jspdf-autotable'],
    ['Excel Export', 'exceljs'],
    ['Mode hors-ligne', 'IndexedDB (Dexie)'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [tech[0]],
    body: tech.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [139, 92, 246], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 3 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Section 6: Rôles Utilisateurs
  addSectionTitle('6. RÔLES ET PERMISSIONS');
  
  const roles = [
    ['Rôle', 'Accès'],
    ['Administrateur', 'Accès complet à tous les modules'],
    ['Chef d\'Agence', 'Gestion agence, validation crédits'],
    ['Gestionnaire Crédit', 'Demandes et suivi des crédits'],
    ['Comptable', 'Comptabilité et rapports financiers'],
    ['Agent Terrain', 'Collectes, visites clients'],
    ['Caissier', 'Opérations de caisse uniquement'],
    ['Superviseur', 'Supervision et rapports'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [roles[0]],
    body: roles.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [245, 158, 11], textColor: 0 },
    styles: { fontSize: 9, cellPadding: 3 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // New page for features
  doc.addPage();
  yPos = 20;

  // Section 7: Fonctionnalités Avancées
  addSectionTitle('7. FONCTIONNALITÉS AVANCÉES');
  
  const features = [
    ['Fonctionnalité', 'Description'],
    ['Mode hors-ligne', 'Synchronisation automatique IndexedDB'],
    ['Bilingue FR/EN', 'Interface en français et anglais'],
    ['Theme sombre', 'Interface optimisée mode sombre'],
    ['GPS Satellite', 'Cartographie des clients et agents'],
    ['Import Excel', 'Import de données clients massif'],
    ['Export PDF/Excel', 'Rapports et documents'],
    ['Notifications SMS', 'Rappels et confirmations automatiques'],
    ['Scoring client', 'Évaluation automatique du risque'],
    ['Tableau de bord temps réel', 'KPIs et statistiques live'],
    ['Gestion multi-agences', 'Plusieurs points de service'],
    ['Intégration bourse', 'Cotations et portefeuille'],
    ['Facturation intégrée', 'Génération de factures'],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [features[0]],
    body: features.slice(1),
    theme: 'striped',
    headStyles: { fillColor: [6, 182, 212], textColor: 255 },
    styles: { fontSize: 9, cellPadding: 3 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // Section 8: Devises et Régions
  addSectionTitle('8. DEVISES ET ZONES SUPPORTÉES');
  addText('• Devise principale: FCFA (Franc CFA CEMAC)');
  addText('• Zones: CEMAC (Congo, Cameroun, Gabon, Tchad, RCA, Guinée Équatoriale)');
  addText('• Transferts internationaux: EUR, USD, GBP, CAD');
  addText('• Conformité: Réglementations BEAC/CEMAC');
  yPos += 5;

  // Section 9: SMS Providers
  addSectionTitle('9. FOURNISSEURS SMS SUPPORTÉS');
  addText('• Twilio (International)');
  addText('• Africa\'s Talking (Afrique)');
  addText('• BulkSMS (Afrique)');
  yPos += 5;

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `MicroFlex - Fiche Technique - Page ${i}/${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
    doc.text(
      `© 2025 MicroFlex. Tous droits réservés.`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' }
    );
  }

  return Buffer.from(doc.output('arraybuffer'));
}
