/**
 * Seed data for the professional catalog (sectors, professions, activity types)
 * Contexte : Congo-Brazzaville, extensible multi-pays
 *
 * Structure ISIC (secteurs) + ISCO (professions) enrichie pour le contexte africain informel
 */

// =============================================
// TYPES D'ACTIVITÉ (statut socio-professionnel)
// =============================================

export const ACTIVITY_TYPES_DATA = [
  { code: 'SALARIE', nom: 'Salarié', sortOrder: 1 },
  { code: 'FONCTIONNAIRE', nom: 'Fonctionnaire', sortOrder: 2 },
  { code: 'INDEPENDANT', nom: 'Indépendant / Freelance', sortOrder: 3 },
  { code: 'AUTO_ENTREPRENEUR', nom: 'Auto-entrepreneur', sortOrder: 4 },
  { code: 'ENTREPRENEUR_INFORMEL', nom: 'Entrepreneur informel', sortOrder: 5 },
  { code: 'JOURNALIER', nom: 'Journalier / Tâcheron', sortOrder: 6 },
  { code: 'ARTISAN', nom: 'Artisan', sortOrder: 7 },
  { code: 'PROFESSION_LIBERALE', nom: 'Profession libérale', sortOrder: 8 },
  { code: 'RETRAITE', nom: 'Retraité(e)', sortOrder: 9 },
  { code: 'ETUDIANT', nom: 'Étudiant(e)', sortOrder: 10 },
  { code: 'SANS_EMPLOI', nom: 'Sans emploi', sortOrder: 11 },
  { code: 'AUTRE', nom: 'Autre', sortOrder: 99 },
] as const;

// =============================================
// SECTEURS D'ACTIVITÉ (hiérarchie parent/enfant)
// =============================================

interface SectorSeed {
  code: string;
  nom: string;
  description: string;
  parentCode?: string;
  keywords?: string[];
  sortOrder: number;
}

export const SECTORS_DATA: SectorSeed[] = [
  // ──────────── TOP-LEVEL (20 secteurs principaux) ────────────

  { code: 'COM', nom: 'Commerce', description: 'Commerce de biens et marchandises', sortOrder: 1, keywords: ['vente', 'achat', 'négoce', 'marchandise'] },
  { code: 'AGR', nom: 'Agriculture & Élevage', description: 'Production agricole et animale', sortOrder: 2, keywords: ['culture', 'récolte', 'élevage', 'ferme'] },
  { code: 'PEC', nom: 'Pêche & Ressources halieutiques', description: 'Pêche artisanale et industrielle', sortOrder: 3, keywords: ['poisson', 'fleuve', 'mer', 'filet'] },
  { code: 'ART', nom: 'Artisanat & Métiers manuels', description: 'Production artisanale et métiers manuels', sortOrder: 4, keywords: ['artisan', 'fabrication', 'manuel'] },
  { code: 'BTP', nom: 'BTP & Construction', description: 'Bâtiment et travaux publics', sortOrder: 5, keywords: ['construction', 'bâtiment', 'chantier', 'travaux'] },
  { code: 'TRA', nom: 'Transport & Logistique', description: 'Transport de personnes et de marchandises', sortOrder: 6, keywords: ['transport', 'logistique', 'livraison'] },
  { code: 'ALI', nom: 'Alimentation & Restauration', description: 'Transformation alimentaire et restauration', sortOrder: 7, keywords: ['nourriture', 'cuisine', 'restaurant'] },
  { code: 'SER', nom: 'Services aux particuliers', description: 'Services divers aux personnes', sortOrder: 8, keywords: ['service', 'prestation'] },
  { code: 'SEN', nom: 'Services aux entreprises', description: 'Services professionnels B2B', sortOrder: 9, keywords: ['entreprise', 'conseil', 'b2b'] },
  { code: 'EDU', nom: 'Éducation & Formation', description: 'Enseignement et formation professionnelle', sortOrder: 10, keywords: ['école', 'formation', 'enseignement'] },
  { code: 'SAN', nom: 'Santé', description: 'Services de santé et soins', sortOrder: 11, keywords: ['santé', 'médecine', 'soins', 'hôpital'] },
  { code: 'ADM', nom: 'Administration & Fonction publique', description: 'Secteur public et parapublic', sortOrder: 12, keywords: ['état', 'gouvernement', 'administration'] },
  { code: 'TEC', nom: 'Technologies & Télécoms', description: 'Technologies de l\'information et télécommunications', sortOrder: 13, keywords: ['informatique', 'télécom', 'internet', 'mobile'] },
  { code: 'FIN', nom: 'Finance & Assurance', description: 'Services financiers et assurance', sortOrder: 14, keywords: ['banque', 'assurance', 'crédit', 'finance'] },
  { code: 'MIN', nom: 'Mines & Extraction', description: 'Extraction minière et pétrolière', sortOrder: 15, keywords: ['mine', 'pétrole', 'extraction', 'minerai'] },
  { code: 'IND', nom: 'Industrie & Production', description: 'Transformation industrielle et fabrication', sortOrder: 16, keywords: ['usine', 'industrie', 'production', 'fabrication'] },
  { code: 'IMM', nom: 'Immobilier', description: 'Gestion et transactions immobilières', sortOrder: 17, keywords: ['immobilier', 'location', 'terrain', 'maison'] },
  { code: 'HOT', nom: 'Hôtellerie & Tourisme', description: 'Hébergement et tourisme', sortOrder: 18, keywords: ['hôtel', 'tourisme', 'hébergement'] },
  { code: 'CUL', nom: 'Culture, Médias & Loisirs', description: 'Arts, médias et divertissement', sortOrder: 19, keywords: ['art', 'musique', 'média', 'loisir'] },
  { code: 'ENV', nom: 'Environnement & Énergie', description: 'Énergie, eau et environnement', sortOrder: 20, keywords: ['énergie', 'eau', 'environnement', 'solaire'] },

  // ──────────── SOUS-SECTEURS COMMERCE (COM) ────────────

  { code: 'COM.GEN', nom: 'Commerce général', description: 'Vente de produits divers', parentCode: 'COM', sortOrder: 1, keywords: ['boutique', 'magasin', 'divers'] },
  { code: 'COM.DET', nom: 'Commerce de détail', description: 'Vente au détail de produits', parentCode: 'COM', sortOrder: 2, keywords: ['détail', 'épicerie', 'dépôt'] },
  { code: 'COM.GRO', nom: 'Commerce de gros', description: 'Vente en gros et demi-gros', parentCode: 'COM', sortOrder: 3, keywords: ['grossiste', 'demi-gros'] },
  { code: 'COM.AMB', nom: 'Commerce ambulant', description: 'Vente ambulante et de rue', parentCode: 'COM', sortOrder: 4, keywords: ['ambulant', 'rue', 'tablier'] },
  { code: 'COM.MAR', nom: 'Marchés & Étals', description: 'Vente sur les marchés', parentCode: 'COM', sortOrder: 5, keywords: ['marché', 'étal', 'stand'] },
  { code: 'COM.IMP', nom: 'Import-Export', description: 'Commerce international et distribution', parentCode: 'COM', sortOrder: 6, keywords: ['import', 'export', 'international'] },
  { code: 'COM.FRI', nom: 'Friperie & Vêtements', description: 'Vente de vêtements neufs et d\'occasion', parentCode: 'COM', sortOrder: 7, keywords: ['friperie', 'vêtement', 'habit', 'tissu'] },
  { code: 'COM.COS', nom: 'Cosmétiques & Beauté', description: 'Vente de produits cosmétiques', parentCode: 'COM', sortOrder: 8, keywords: ['cosmétique', 'beauté', 'produit'] },
  { code: 'COM.QUI', nom: 'Quincaillerie & Matériaux', description: 'Vente de matériaux et quincaillerie', parentCode: 'COM', sortOrder: 9, keywords: ['quincaillerie', 'matériaux', 'fer'] },
  { code: 'COM.PHO', nom: 'Téléphonie & Accessoires', description: 'Vente de téléphones et accessoires', parentCode: 'COM', sortOrder: 10, keywords: ['téléphone', 'accessoire', 'smartphone'] },

  // ──────────── SOUS-SECTEURS AGRICULTURE (AGR) ────────────

  { code: 'AGR.VIV', nom: 'Agriculture vivrière', description: 'Cultures vivrières (manioc, maïs, arachide...)', parentCode: 'AGR', sortOrder: 1, keywords: ['manioc', 'maïs', 'arachide', 'vivrier'] },
  { code: 'AGR.MAR', nom: 'Maraîchage', description: 'Cultures maraîchères et légumières', parentCode: 'AGR', sortOrder: 2, keywords: ['légume', 'maraîcher', 'jardin'] },
  { code: 'AGR.FRU', nom: 'Arboriculture & Fruits', description: 'Production fruitière et cultures pérennes', parentCode: 'AGR', sortOrder: 3, keywords: ['fruit', 'arbre', 'plantation'] },
  { code: 'AGR.COM', nom: 'Cultures commerciales', description: 'Cacao, café, palmier à huile, canne à sucre', parentCode: 'AGR', sortOrder: 4, keywords: ['cacao', 'café', 'palmier', 'huile'] },
  { code: 'AGR.ELV', nom: 'Élevage', description: 'Élevage de volailles, porcs, bovins, caprins', parentCode: 'AGR', sortOrder: 5, keywords: ['poulet', 'porc', 'boeuf', 'chèvre', 'volaille'] },
  { code: 'AGR.API', nom: 'Apiculture', description: 'Élevage d\'abeilles et production de miel', parentCode: 'AGR', sortOrder: 6, keywords: ['abeille', 'miel', 'ruche'] },
  { code: 'AGR.AQU', nom: 'Aquaculture', description: 'Élevage de poissons en étangs', parentCode: 'AGR', sortOrder: 7, keywords: ['poisson', 'étang', 'tilapia'] },

  // ──────────── SOUS-SECTEURS PÊCHE (PEC) ────────────

  { code: 'PEC.ART', nom: 'Pêche artisanale', description: 'Pêche traditionnelle en rivière et mer', parentCode: 'PEC', sortOrder: 1, keywords: ['pirogue', 'filet', 'rivière'] },
  { code: 'PEC.FLU', nom: 'Pêche fluviale', description: 'Pêche sur le fleuve Congo et affluents', parentCode: 'PEC', sortOrder: 2, keywords: ['fleuve', 'Congo', 'nasse'] },
  { code: 'PEC.MAR', nom: 'Pêche maritime', description: 'Pêche en mer', parentCode: 'PEC', sortOrder: 3, keywords: ['mer', 'océan', 'chalut'] },
  { code: 'PEC.TRA', nom: 'Transformation du poisson', description: 'Fumage, séchage, salage de poisson', parentCode: 'PEC', sortOrder: 4, keywords: ['fumage', 'séchage', 'conservation'] },

  // ──────────── SOUS-SECTEURS ARTISANAT (ART) ────────────

  { code: 'ART.BOS', nom: 'Bois & Menuiserie', description: 'Travail du bois et fabrication de meubles', parentCode: 'ART', sortOrder: 1, keywords: ['bois', 'meuble', 'menuiserie', 'ébénisterie'] },
  { code: 'ART.MET', nom: 'Métallurgie & Soudure', description: 'Travaux de soudure et ferronnerie', parentCode: 'ART', sortOrder: 2, keywords: ['soudure', 'fer', 'métal', 'ferronnerie'] },
  { code: 'ART.COU', nom: 'Couture & Confection', description: 'Couture, stylisme et confection textile', parentCode: 'ART', sortOrder: 3, keywords: ['couture', 'tissu', 'confection', 'mode'] },
  { code: 'ART.COI', nom: 'Coiffure & Esthétique', description: 'Salons de coiffure et soins esthétiques', parentCode: 'ART', sortOrder: 4, keywords: ['coiffure', 'salon', 'tresse', 'esthétique'] },
  { code: 'ART.TIS', nom: 'Tissage & Vannerie', description: 'Tissage, vannerie et artisanat d\'art', parentCode: 'ART', sortOrder: 5, keywords: ['vannerie', 'tissage', 'panier', 'natte'] },
  { code: 'ART.POT', nom: 'Poterie & Céramique', description: 'Production de poteries et céramiques', parentCode: 'ART', sortOrder: 6, keywords: ['poterie', 'céramique', 'argile'] },
  { code: 'ART.CUI', nom: 'Maroquinerie & Cuir', description: 'Travail du cuir et maroquinerie', parentCode: 'ART', sortOrder: 7, keywords: ['cuir', 'maroquinerie', 'chaussure'] },
  { code: 'ART.PIE', nom: 'Pierres & Bijoux', description: 'Bijouterie et travail des pierres', parentCode: 'ART', sortOrder: 8, keywords: ['bijou', 'pierre', 'or', 'joaillerie'] },

  // ──────────── SOUS-SECTEURS BTP (BTP) ────────────

  { code: 'BTP.MAC', nom: 'Maçonnerie', description: 'Construction en maçonnerie', parentCode: 'BTP', sortOrder: 1, keywords: ['maçon', 'brique', 'ciment', 'mur'] },
  { code: 'BTP.CAR', nom: 'Carrelage & Revêtement', description: 'Pose de carrelage et revêtements', parentCode: 'BTP', sortOrder: 2, keywords: ['carrelage', 'revêtement', 'sol'] },
  { code: 'BTP.PLO', nom: 'Plomberie', description: 'Installation et réparation plomberie', parentCode: 'BTP', sortOrder: 3, keywords: ['plomberie', 'tuyau', 'eau', 'robinet'] },
  { code: 'BTP.ELE', nom: 'Électricité', description: 'Installation et maintenance électrique', parentCode: 'BTP', sortOrder: 4, keywords: ['électricité', 'câble', 'installation'] },
  { code: 'BTP.PEI', nom: 'Peinture & Décoration', description: 'Peinture et finitions de bâtiment', parentCode: 'BTP', sortOrder: 5, keywords: ['peinture', 'décoration', 'finition'] },
  { code: 'BTP.CHA', nom: 'Charpente & Toiture', description: 'Charpente et couverture de toitures', parentCode: 'BTP', sortOrder: 6, keywords: ['charpente', 'toiture', 'tôle'] },
  { code: 'BTP.TOP', nom: 'Topographie & Génie civil', description: 'Études topographiques et génie civil', parentCode: 'BTP', sortOrder: 7, keywords: ['topographie', 'génie', 'civil', 'route'] },

  // ──────────── SOUS-SECTEURS TRANSPORT (TRA) ────────────

  { code: 'TRA.URB', nom: 'Transport urbain', description: 'Taxi, moto-taxi et transport en commun', parentCode: 'TRA', sortOrder: 1, keywords: ['taxi', 'moto-taxi', 'bus', 'urbain'] },
  { code: 'TRA.INT', nom: 'Transport interurbain', description: 'Transport entre villes', parentCode: 'TRA', sortOrder: 2, keywords: ['interurbain', 'car', 'route'] },
  { code: 'TRA.MAR', nom: 'Transport de marchandises', description: 'Fret routier et déménagement', parentCode: 'TRA', sortOrder: 3, keywords: ['fret', 'camion', 'marchandise', 'déménagement'] },
  { code: 'TRA.FLU', nom: 'Transport fluvial', description: 'Transport par voie fluviale', parentCode: 'TRA', sortOrder: 4, keywords: ['fleuve', 'bateau', 'pirogue', 'baleinière'] },
  { code: 'TRA.LIV', nom: 'Livraison & Coursier', description: 'Services de livraison et coursier', parentCode: 'TRA', sortOrder: 5, keywords: ['livraison', 'coursier', 'colis'] },

  // ──────────── SOUS-SECTEURS ALIMENTATION (ALI) ────────────

  { code: 'ALI.RES', nom: 'Restauration', description: 'Restaurants, gargotes et fast-foods', parentCode: 'ALI', sortOrder: 1, keywords: ['restaurant', 'gargote', 'manger'] },
  { code: 'ALI.BOU', nom: 'Boulangerie & Pâtisserie', description: 'Fabrication de pain et pâtisseries', parentCode: 'ALI', sortOrder: 2, keywords: ['pain', 'boulanger', 'pâtisserie'] },
  { code: 'ALI.BOI', nom: 'Boissons & Bar', description: 'Bars, buvettes et vente de boissons', parentCode: 'ALI', sortOrder: 3, keywords: ['bar', 'buvette', 'boisson', 'bière'] },
  { code: 'ALI.BPC', nom: 'Boucherie & Poissonnerie', description: 'Vente de viande et poisson', parentCode: 'ALI', sortOrder: 4, keywords: ['viande', 'poisson', 'boucherie'] },
  { code: 'ALI.TRA', nom: 'Transformation alimentaire', description: 'Transformation de produits agricoles', parentCode: 'ALI', sortOrder: 5, keywords: ['transformation', 'conserve', 'huile'] },
  { code: 'ALI.TRA2', nom: 'Traiteur & Événementiel', description: 'Services traiteur pour événements', parentCode: 'ALI', sortOrder: 6, keywords: ['traiteur', 'événement', 'cérémonie'] },

  // ──────────── SOUS-SECTEURS SERVICES AUX PARTICULIERS (SER) ────────────

  { code: 'SER.MOB', nom: 'Mobile Money & Transfert', description: 'Services de mobile money et transferts d\'argent', parentCode: 'SER', sortOrder: 1, keywords: ['mobile money', 'airtel', 'mtn', 'transfert'] },
  { code: 'SER.TEL', nom: 'Téléphonie & Crédit', description: 'Recharge téléphonique et services télécoms', parentCode: 'SER', sortOrder: 2, keywords: ['crédit', 'recharge', 'téléphone'] },
  { code: 'SER.LAV', nom: 'Blanchisserie & Pressing', description: 'Lavage et repassage de vêtements', parentCode: 'SER', sortOrder: 3, keywords: ['lavage', 'pressing', 'repassage'] },
  { code: 'SER.PHO', nom: 'Photographie & Vidéo', description: 'Services photo et vidéo', parentCode: 'SER', sortOrder: 4, keywords: ['photo', 'vidéo', 'studio'] },
  { code: 'SER.REP', nom: 'Réparation & Maintenance', description: 'Réparation d\'appareils et équipements', parentCode: 'SER', sortOrder: 5, keywords: ['réparation', 'dépannage', 'maintenance'] },
  { code: 'SER.GAR', nom: 'Gardiennage & Sécurité', description: 'Services de gardiennage et sécurité', parentCode: 'SER', sortOrder: 6, keywords: ['gardien', 'sécurité', 'surveillance'] },
  { code: 'SER.DOM', nom: 'Services domestiques', description: 'Aide ménagère, jardinage, nettoyage', parentCode: 'SER', sortOrder: 7, keywords: ['ménage', 'domestique', 'nettoyage'] },
  { code: 'SER.CYB', nom: 'Cybercafé & Secrétariat', description: 'Cybercafés, impression, saisie', parentCode: 'SER', sortOrder: 8, keywords: ['cyber', 'impression', 'saisie', 'internet'] },

  // ──────────── SOUS-SECTEURS SERVICES AUX ENTREPRISES (SEN) ────────────

  { code: 'SEN.COM', nom: 'Comptabilité & Audit', description: 'Services comptables et d\'audit', parentCode: 'SEN', sortOrder: 1, keywords: ['comptabilité', 'audit', 'fiscal'] },
  { code: 'SEN.JUR', nom: 'Juridique & Notariat', description: 'Services juridiques et notariaux', parentCode: 'SEN', sortOrder: 2, keywords: ['avocat', 'notaire', 'juridique'] },
  { code: 'SEN.CON', nom: 'Conseil & Consulting', description: 'Services de conseil aux entreprises', parentCode: 'SEN', sortOrder: 3, keywords: ['conseil', 'consultant', 'stratégie'] },
  { code: 'SEN.PUB', nom: 'Publicité & Communication', description: 'Marketing, publicité et communication', parentCode: 'SEN', sortOrder: 4, keywords: ['publicité', 'marketing', 'communication'] },

  // ──────────── SOUS-SECTEURS ÉDUCATION (EDU) ────────────

  { code: 'EDU.PRI', nom: 'Enseignement primaire', description: 'Écoles primaires', parentCode: 'EDU', sortOrder: 1, keywords: ['primaire', 'école', 'instituteur'] },
  { code: 'EDU.SEC', nom: 'Enseignement secondaire', description: 'Collèges et lycées', parentCode: 'EDU', sortOrder: 2, keywords: ['secondaire', 'collège', 'lycée'] },
  { code: 'EDU.SUP', nom: 'Enseignement supérieur', description: 'Universités et grandes écoles', parentCode: 'EDU', sortOrder: 3, keywords: ['université', 'supérieur', 'faculté'] },
  { code: 'EDU.FOR', nom: 'Formation professionnelle', description: 'Centres de formation et apprentissage', parentCode: 'EDU', sortOrder: 4, keywords: ['formation', 'apprentissage', 'professionnel'] },
  { code: 'EDU.COU', nom: 'Cours particuliers', description: 'Soutien scolaire et cours privés', parentCode: 'EDU', sortOrder: 5, keywords: ['cours', 'répétiteur', 'soutien'] },

  // ──────────── SOUS-SECTEURS SANTÉ (SAN) ────────────

  { code: 'SAN.GEN', nom: 'Médecine générale', description: 'Soins médicaux généraux', parentCode: 'SAN', sortOrder: 1, keywords: ['médecin', 'clinique', 'consultation'] },
  { code: 'SAN.PHA', nom: 'Pharmacie', description: 'Officines et vente de médicaments', parentCode: 'SAN', sortOrder: 2, keywords: ['pharmacie', 'médicament', 'officine'] },
  { code: 'SAN.INF', nom: 'Soins infirmiers', description: 'Soins infirmiers et paramédicaux', parentCode: 'SAN', sortOrder: 3, keywords: ['infirmier', 'soins', 'pansement'] },
  { code: 'SAN.TRA', nom: 'Médecine traditionnelle', description: 'Tradipraticiens et herboristerie', parentCode: 'SAN', sortOrder: 4, keywords: ['traditionnel', 'herboriste', 'tradipraticien'] },
  { code: 'SAN.DEN', nom: 'Dentisterie', description: 'Soins dentaires', parentCode: 'SAN', sortOrder: 5, keywords: ['dentiste', 'dent', 'oral'] },
  { code: 'SAN.OPT', nom: 'Optique & Ophtalmologie', description: 'Lunettes et soins visuels', parentCode: 'SAN', sortOrder: 6, keywords: ['optique', 'lunette', 'oeil'] },
  { code: 'SAN.BIE', nom: 'Bien-être & Massage', description: 'Massage, kinésithérapie et bien-être', parentCode: 'SAN', sortOrder: 7, keywords: ['massage', 'bien-être', 'kiné'] },

  // ──────────── SOUS-SECTEURS TECHNOLOGIES (TEC) ────────────

  { code: 'TEC.DEV', nom: 'Développement logiciel', description: 'Programmation et développement de logiciels', parentCode: 'TEC', sortOrder: 1, keywords: ['programmation', 'logiciel', 'développeur'] },
  { code: 'TEC.RES', nom: 'Réseaux & Infrastructure', description: 'Installation et maintenance de réseaux', parentCode: 'TEC', sortOrder: 2, keywords: ['réseau', 'serveur', 'infrastructure'] },
  { code: 'TEC.REP', nom: 'Réparation électronique', description: 'Réparation de téléphones et ordinateurs', parentCode: 'TEC', sortOrder: 3, keywords: ['réparation', 'téléphone', 'ordinateur'] },
  { code: 'TEC.WEB', nom: 'Web & Digital', description: 'Création de sites web et services digitaux', parentCode: 'TEC', sortOrder: 4, keywords: ['web', 'site', 'digital', 'internet'] },

  // ──────────── SOUS-SECTEURS FINANCE (FIN) ────────────

  { code: 'FIN.BAN', nom: 'Banque', description: 'Services bancaires', parentCode: 'FIN', sortOrder: 1, keywords: ['banque', 'agence', 'guichet'] },
  { code: 'FIN.MIC', nom: 'Microfinance', description: 'Institutions de microfinance', parentCode: 'FIN', sortOrder: 2, keywords: ['microfinance', 'crédit', 'épargne'] },
  { code: 'FIN.ASS', nom: 'Assurance', description: 'Services d\'assurance', parentCode: 'FIN', sortOrder: 3, keywords: ['assurance', 'police', 'risque'] },
  { code: 'FIN.CHA', nom: 'Change & Devises', description: 'Bureau de change et transactions', parentCode: 'FIN', sortOrder: 4, keywords: ['change', 'devise', 'dollar', 'euro'] },

  // ──────────── SOUS-SECTEURS MINES (MIN) ────────────

  { code: 'MIN.PET', nom: 'Pétrole & Gaz', description: 'Extraction pétrolière et gazière', parentCode: 'MIN', sortOrder: 1, keywords: ['pétrole', 'gaz', 'forage'] },
  { code: 'MIN.MIN', nom: 'Exploitation minière', description: 'Extraction de minerais', parentCode: 'MIN', sortOrder: 2, keywords: ['mine', 'minerai', 'carrière'] },
  { code: 'MIN.SAB', nom: 'Sable & Gravier', description: 'Extraction de sable et gravier', parentCode: 'MIN', sortOrder: 3, keywords: ['sable', 'gravier', 'carrière'] },

  // ──────────── SOUS-SECTEURS INDUSTRIE (IND) ────────────

  { code: 'IND.AGR', nom: 'Agro-industrie', description: 'Transformation industrielle de produits agricoles', parentCode: 'IND', sortOrder: 1, keywords: ['agroalimentaire', 'usine', 'transformation'] },
  { code: 'IND.BOI', nom: 'Industrie du bois', description: 'Scierie et transformation du bois', parentCode: 'IND', sortOrder: 2, keywords: ['scierie', 'bois', 'grume'] },
  { code: 'IND.TEX', nom: 'Textile & Habillement', description: 'Industrie textile', parentCode: 'IND', sortOrder: 3, keywords: ['textile', 'confection', 'tissu'] },
  { code: 'IND.CHI', nom: 'Chimie & Cosmétique', description: 'Produits chimiques et cosmétiques', parentCode: 'IND', sortOrder: 4, keywords: ['chimie', 'savon', 'cosmétique'] },

  // ──────────── SOUS-SECTEURS HÔTELLERIE (HOT) ────────────

  { code: 'HOT.HEB', nom: 'Hébergement', description: 'Hôtels, auberges et maisons d\'hôtes', parentCode: 'HOT', sortOrder: 1, keywords: ['hôtel', 'auberge', 'chambre'] },
  { code: 'HOT.TOU', nom: 'Tourisme & Loisirs', description: 'Agences de voyage et activités touristiques', parentCode: 'HOT', sortOrder: 2, keywords: ['voyage', 'touriste', 'guide'] },

  // ──────────── SOUS-SECTEURS CULTURE (CUL) ────────────

  { code: 'CUL.MUS', nom: 'Musique & Spectacle', description: 'Production musicale et spectacles', parentCode: 'CUL', sortOrder: 1, keywords: ['musique', 'concert', 'spectacle', 'DJ'] },
  { code: 'CUL.MED', nom: 'Médias & Presse', description: 'Journalisme, radio et télévision', parentCode: 'CUL', sortOrder: 2, keywords: ['radio', 'télévision', 'journal', 'presse'] },
  { code: 'CUL.ART', nom: 'Arts visuels & Artisanat d\'art', description: 'Peinture, sculpture et arts visuels', parentCode: 'CUL', sortOrder: 3, keywords: ['peinture', 'sculpture', 'art'] },
  { code: 'CUL.SPO', nom: 'Sport & Fitness', description: 'Sports et activités physiques', parentCode: 'CUL', sortOrder: 4, keywords: ['sport', 'football', 'gym', 'fitness'] },

  // ──────────── SOUS-SECTEURS ENVIRONNEMENT (ENV) ────────────

  { code: 'ENV.ENE', nom: 'Énergie solaire & Renouvelable', description: 'Installation et vente d\'équipements solaires', parentCode: 'ENV', sortOrder: 1, keywords: ['solaire', 'panneau', 'énergie', 'renouvelable'] },
  { code: 'ENV.EAU', nom: 'Eau & Assainissement', description: 'Adduction d\'eau et assainissement', parentCode: 'ENV', sortOrder: 2, keywords: ['eau', 'forage', 'assainissement'] },
  { code: 'ENV.DEC', nom: 'Gestion des déchets', description: 'Collecte et traitement des déchets', parentCode: 'ENV', sortOrder: 3, keywords: ['déchet', 'recyclage', 'collecte'] },

  // ──────────── SOUS-SECTEURS ADMINISTRATION (ADM) ────────────

  { code: 'ADM.CEN', nom: 'Administration centrale', description: 'Ministères et services centraux', parentCode: 'ADM', sortOrder: 1, keywords: ['ministère', 'central', 'direction'] },
  { code: 'ADM.LOC', nom: 'Administration locale', description: 'Mairies, préfectures, sous-préfectures', parentCode: 'ADM', sortOrder: 2, keywords: ['mairie', 'préfecture', 'local'] },
  { code: 'ADM.SEC', nom: 'Sécurité & Défense', description: 'Forces armées, police, gendarmerie', parentCode: 'ADM', sortOrder: 3, keywords: ['police', 'armée', 'gendarmerie', 'militaire'] },
  { code: 'ADM.JUS', nom: 'Justice', description: 'Tribunaux et services judiciaires', parentCode: 'ADM', sortOrder: 4, keywords: ['justice', 'tribunal', 'juge'] },

  // ──────────── SOUS-SECTEURS IMMOBILIER (IMM) ────────────

  { code: 'IMM.LOC', nom: 'Location immobilière', description: 'Gestion de biens en location', parentCode: 'IMM', sortOrder: 1, keywords: ['location', 'loyer', 'bailleur'] },
  { code: 'IMM.VEN', nom: 'Transactions immobilières', description: 'Vente et achat de biens', parentCode: 'IMM', sortOrder: 2, keywords: ['vente', 'achat', 'terrain'] },
  { code: 'IMM.GES', nom: 'Gestion de patrimoine', description: 'Administration de biens immobiliers', parentCode: 'IMM', sortOrder: 3, keywords: ['patrimoine', 'gestion', 'syndic'] },
];

// =============================================
// PROFESSIONS (~150 entrées)
// =============================================

interface ProfessionSeed {
  code: string;
  nom: string;
  keywords?: string[];
  sortOrder: number;
  /** Codes secteurs associés (sous-secteurs de préférence) */
  sectorCodes: string[];
  /** Codes types d'activité compatibles */
  activityTypeCodes: string[];
  /** Code secteur par défaut */
  defaultSector: string;
  /** Code type d'activité par défaut */
  defaultActivity: string;
}

export const PROFESSIONS_DATA: ProfessionSeed[] = [
  // ──────────── COMMERCE ────────────

  { code: 'VEND_AMB', nom: 'Vendeur ambulant', keywords: ['ambulant', 'rue', 'tablier'], sortOrder: 1, sectorCodes: ['COM.AMB', 'COM.DET', 'COM.MAR'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL', 'JOURNALIER'], defaultSector: 'COM.AMB', defaultActivity: 'ENTREPRENEUR_INFORMEL' },
  { code: 'MARCH_MAR', nom: 'Marchand de marché', keywords: ['marché', 'étal', 'stand'], sortOrder: 2, sectorCodes: ['COM.MAR', 'COM.DET'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'COM.MAR', defaultActivity: 'INDEPENDANT' },
  { code: 'DET_ALI', nom: 'Détaillant alimentation', keywords: ['épicerie', 'boutique', 'alimentaire'], sortOrder: 3, sectorCodes: ['COM.DET', 'ALI.RES'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL', 'AUTO_ENTREPRENEUR'], defaultSector: 'COM.DET', defaultActivity: 'INDEPENDANT' },
  { code: 'REV_CRED', nom: 'Revendeur crédit téléphonique', keywords: ['crédit', 'recharge', 'airtel', 'mtn'], sortOrder: 4, sectorCodes: ['SER.TEL', 'COM.AMB'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'SER.TEL', defaultActivity: 'ENTREPRENEUR_INFORMEL' },
  { code: 'GROSS', nom: 'Grossiste', keywords: ['gros', 'demi-gros', 'stock'], sortOrder: 5, sectorCodes: ['COM.GRO'], activityTypeCodes: ['AUTO_ENTREPRENEUR', 'INDEPENDANT'], defaultSector: 'COM.GRO', defaultActivity: 'AUTO_ENTREPRENEUR' },
  { code: 'BOUT', nom: 'Boutiquier / Épicier', keywords: ['boutique', 'épicerie', 'dépôt'], sortOrder: 6, sectorCodes: ['COM.DET', 'COM.GEN'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'COM.DET', defaultActivity: 'INDEPENDANT' },
  { code: 'FRIP', nom: 'Fripier', keywords: ['friperie', 'vêtement', 'occasion'], sortOrder: 7, sectorCodes: ['COM.FRI', 'COM.MAR'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'COM.FRI', defaultActivity: 'INDEPENDANT' },
  { code: 'IMP_EXP', nom: 'Importateur-Exportateur', keywords: ['import', 'export', 'douane'], sortOrder: 8, sectorCodes: ['COM.IMP'], activityTypeCodes: ['AUTO_ENTREPRENEUR', 'INDEPENDANT'], defaultSector: 'COM.IMP', defaultActivity: 'AUTO_ENTREPRENEUR' },
  { code: 'QUINCAIL', nom: 'Quincaillier', keywords: ['quincaillerie', 'fer', 'matériaux'], sortOrder: 9, sectorCodes: ['COM.QUI', 'COM.DET'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR'], defaultSector: 'COM.QUI', defaultActivity: 'INDEPENDANT' },
  { code: 'VEND_COS', nom: 'Vendeur de cosmétiques', keywords: ['cosmétique', 'beauté', 'crème'], sortOrder: 10, sectorCodes: ['COM.COS', 'COM.AMB'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'COM.COS', defaultActivity: 'INDEPENDANT' },
  { code: 'VEND_PHO', nom: 'Vendeur de téléphones', keywords: ['téléphone', 'smartphone', 'accessoire'], sortOrder: 11, sectorCodes: ['COM.PHO'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR', 'SALARIE'], defaultSector: 'COM.PHO', defaultActivity: 'INDEPENDANT' },

  // ──────────── TRANSPORT ────────────

  { code: 'CHAUF_TAXI', nom: 'Chauffeur de taxi', keywords: ['taxi', 'chauffeur', 'course'], sortOrder: 20, sectorCodes: ['TRA.URB'], activityTypeCodes: ['INDEPENDANT', 'SALARIE', 'JOURNALIER'], defaultSector: 'TRA.URB', defaultActivity: 'INDEPENDANT' },
  { code: 'MOTO_TAXI', nom: 'Conducteur moto-taxi', keywords: ['moto', 'moto-taxi', 'deux-roues'], sortOrder: 21, sectorCodes: ['TRA.URB'], activityTypeCodes: ['INDEPENDANT', 'JOURNALIER', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'TRA.URB', defaultActivity: 'INDEPENDANT' },
  { code: 'CHAUF_BUS', nom: 'Chauffeur de bus / minibus', keywords: ['bus', 'minibus', 'transport commun'], sortOrder: 22, sectorCodes: ['TRA.URB', 'TRA.INT'], activityTypeCodes: ['SALARIE', 'INDEPENDANT'], defaultSector: 'TRA.URB', defaultActivity: 'SALARIE' },
  { code: 'CONVOY', nom: 'Convoyeur', keywords: ['convoyeur', 'receveur', 'bus'], sortOrder: 23, sectorCodes: ['TRA.URB'], activityTypeCodes: ['SALARIE', 'JOURNALIER'], defaultSector: 'TRA.URB', defaultActivity: 'SALARIE' },
  { code: 'CHAUF_CAM', nom: 'Chauffeur poids lourd', keywords: ['camion', 'poids lourd', 'routier'], sortOrder: 24, sectorCodes: ['TRA.MAR', 'TRA.INT'], activityTypeCodes: ['SALARIE', 'INDEPENDANT'], defaultSector: 'TRA.MAR', defaultActivity: 'SALARIE' },
  { code: 'BATEL', nom: 'Batelier / Piroguier', keywords: ['pirogue', 'bateau', 'fleuve'], sortOrder: 25, sectorCodes: ['TRA.FLU'], activityTypeCodes: ['INDEPENDANT', 'JOURNALIER'], defaultSector: 'TRA.FLU', defaultActivity: 'INDEPENDANT' },
  { code: 'LIVREUR', nom: 'Livreur / Coursier', keywords: ['livraison', 'coursier', 'colis'], sortOrder: 26, sectorCodes: ['TRA.LIV'], activityTypeCodes: ['SALARIE', 'INDEPENDANT', 'JOURNALIER'], defaultSector: 'TRA.LIV', defaultActivity: 'INDEPENDANT' },

  // ──────────── ARTISANAT ────────────

  { code: 'MENUISIER', nom: 'Menuisier', keywords: ['bois', 'meuble', 'porte'], sortOrder: 30, sectorCodes: ['ART.BOS', 'BTP.CHA'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'SALARIE'], defaultSector: 'ART.BOS', defaultActivity: 'ARTISAN' },
  { code: 'SOUDEUR', nom: 'Soudeur / Ferronnier', keywords: ['soudure', 'fer', 'portail', 'grille'], sortOrder: 31, sectorCodes: ['ART.MET', 'BTP.MAC'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'SALARIE'], defaultSector: 'ART.MET', defaultActivity: 'ARTISAN' },
  { code: 'MACON', nom: 'Maçon', keywords: ['maçonnerie', 'brique', 'ciment', 'mur'], sortOrder: 32, sectorCodes: ['BTP.MAC'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'JOURNALIER', 'SALARIE'], defaultSector: 'BTP.MAC', defaultActivity: 'ARTISAN' },
  { code: 'COUTURIER', nom: 'Couturier(ère) / Tailleur', keywords: ['couture', 'tissu', 'tailleur', 'robe'], sortOrder: 33, sectorCodes: ['ART.COU'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'AUTO_ENTREPRENEUR'], defaultSector: 'ART.COU', defaultActivity: 'ARTISAN' },
  { code: 'COIFFEUR', nom: 'Coiffeur(euse)', keywords: ['coiffure', 'tresse', 'salon', 'cheveux'], sortOrder: 34, sectorCodes: ['ART.COI'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'SALARIE'], defaultSector: 'ART.COI', defaultActivity: 'ARTISAN' },
  { code: 'PLOMBIER', nom: 'Plombier', keywords: ['plomberie', 'tuyau', 'robinet'], sortOrder: 35, sectorCodes: ['BTP.PLO'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'SALARIE'], defaultSector: 'BTP.PLO', defaultActivity: 'ARTISAN' },
  { code: 'ELECTRICIEN', nom: 'Électricien', keywords: ['électricité', 'câble', 'branchement'], sortOrder: 36, sectorCodes: ['BTP.ELE'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'SALARIE'], defaultSector: 'BTP.ELE', defaultActivity: 'ARTISAN' },
  { code: 'PEINTRE_BAT', nom: 'Peintre en bâtiment', keywords: ['peinture', 'rouleau', 'finition'], sortOrder: 37, sectorCodes: ['BTP.PEI'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'JOURNALIER'], defaultSector: 'BTP.PEI', defaultActivity: 'ARTISAN' },
  { code: 'CARRELEUR', nom: 'Carreleur', keywords: ['carrelage', 'sol', 'faïence'], sortOrder: 38, sectorCodes: ['BTP.CAR'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'JOURNALIER'], defaultSector: 'BTP.CAR', defaultActivity: 'ARTISAN' },
  { code: 'CHARPENTIER', nom: 'Charpentier / Couvreur', keywords: ['charpente', 'toit', 'tôle'], sortOrder: 39, sectorCodes: ['BTP.CHA'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT'], defaultSector: 'BTP.CHA', defaultActivity: 'ARTISAN' },
  { code: 'VANNIER', nom: 'Vannier / Tisserand', keywords: ['vannerie', 'panier', 'natte'], sortOrder: 40, sectorCodes: ['ART.TIS'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'ART.TIS', defaultActivity: 'ARTISAN' },
  { code: 'POTIER', nom: 'Potier', keywords: ['poterie', 'argile', 'terre cuite'], sortOrder: 41, sectorCodes: ['ART.POT'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT'], defaultSector: 'ART.POT', defaultActivity: 'ARTISAN' },
  { code: 'BIJOUTIER', nom: 'Bijoutier / Joaillier', keywords: ['bijou', 'or', 'joaillerie'], sortOrder: 42, sectorCodes: ['ART.PIE'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT'], defaultSector: 'ART.PIE', defaultActivity: 'ARTISAN' },
  { code: 'CORDONNIER', nom: 'Cordonnier', keywords: ['chaussure', 'cuir', 'réparation'], sortOrder: 43, sectorCodes: ['ART.CUI'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'ART.CUI', defaultActivity: 'ARTISAN' },

  // ──────────── AGRICULTURE & PÊCHE ────────────

  { code: 'MARAICHER', nom: 'Maraîcher', keywords: ['légume', 'jardin', 'maraîchage'], sortOrder: 50, sectorCodes: ['AGR.MAR', 'AGR.VIV'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL', 'JOURNALIER'], defaultSector: 'AGR.MAR', defaultActivity: 'INDEPENDANT' },
  { code: 'CULTIVATEUR', nom: 'Cultivateur / Agriculteur', keywords: ['champ', 'culture', 'récolte', 'plantation'], sortOrder: 51, sectorCodes: ['AGR.VIV', 'AGR.COM'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'AGR.VIV', defaultActivity: 'INDEPENDANT' },
  { code: 'ELEVEUR', nom: 'Éleveur', keywords: ['élevage', 'bétail', 'volaille', 'porc'], sortOrder: 52, sectorCodes: ['AGR.ELV'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'AGR.ELV', defaultActivity: 'INDEPENDANT' },
  { code: 'PECHEUR', nom: 'Pêcheur artisanal', keywords: ['pêche', 'poisson', 'filet', 'pirogue'], sortOrder: 53, sectorCodes: ['PEC.ART', 'PEC.FLU'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL', 'JOURNALIER'], defaultSector: 'PEC.ART', defaultActivity: 'INDEPENDANT' },
  { code: 'APICULTEUR', nom: 'Apiculteur', keywords: ['abeille', 'miel', 'ruche'], sortOrder: 54, sectorCodes: ['AGR.API'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR'], defaultSector: 'AGR.API', defaultActivity: 'INDEPENDANT' },
  { code: 'PISCICULT', nom: 'Pisciculteur', keywords: ['poisson', 'étang', 'aquaculture'], sortOrder: 55, sectorCodes: ['AGR.AQU'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR'], defaultSector: 'AGR.AQU', defaultActivity: 'INDEPENDANT' },
  { code: 'FUMEUR_POIS', nom: 'Fumeur de poisson', keywords: ['fumage', 'poisson fumé', 'conservation'], sortOrder: 56, sectorCodes: ['PEC.TRA', 'ALI.TRA'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'PEC.TRA', defaultActivity: 'ENTREPRENEUR_INFORMEL' },

  // ──────────── ALIMENTATION & RESTAURATION ────────────

  { code: 'RESTAURAT', nom: 'Restaurateur(trice)', keywords: ['restaurant', 'cuisine', 'repas'], sortOrder: 60, sectorCodes: ['ALI.RES'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'ALI.RES', defaultActivity: 'INDEPENDANT' },
  { code: 'GARGOTIER', nom: 'Gargotier(ère)', keywords: ['gargote', 'manger', 'rue', 'plat'], sortOrder: 61, sectorCodes: ['ALI.RES'], activityTypeCodes: ['ENTREPRENEUR_INFORMEL', 'INDEPENDANT'], defaultSector: 'ALI.RES', defaultActivity: 'ENTREPRENEUR_INFORMEL' },
  { code: 'BOULANGER', nom: 'Boulanger(ère)', keywords: ['pain', 'boulangerie', 'four'], sortOrder: 62, sectorCodes: ['ALI.BOU'], activityTypeCodes: ['ARTISAN', 'SALARIE', 'INDEPENDANT'], defaultSector: 'ALI.BOU', defaultActivity: 'ARTISAN' },
  { code: 'PATISSIER', nom: 'Pâtissier(ère)', keywords: ['gâteau', 'pâtisserie'], sortOrder: 63, sectorCodes: ['ALI.BOU'], activityTypeCodes: ['ARTISAN', 'SALARIE', 'INDEPENDANT'], defaultSector: 'ALI.BOU', defaultActivity: 'ARTISAN' },
  { code: 'BOUCHER', nom: 'Boucher', keywords: ['viande', 'boucherie', 'abattoir'], sortOrder: 64, sectorCodes: ['ALI.BPC'], activityTypeCodes: ['INDEPENDANT', 'SALARIE', 'ARTISAN'], defaultSector: 'ALI.BPC', defaultActivity: 'INDEPENDANT' },
  { code: 'POISSONNIER', nom: 'Poissonnier(ère)', keywords: ['poisson', 'marché', 'frais'], sortOrder: 65, sectorCodes: ['ALI.BPC', 'COM.MAR'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'ALI.BPC', defaultActivity: 'INDEPENDANT' },
  { code: 'BARMAN', nom: 'Barman / Gérant de bar', keywords: ['bar', 'buvette', 'boisson'], sortOrder: 66, sectorCodes: ['ALI.BOI'], activityTypeCodes: ['SALARIE', 'INDEPENDANT'], defaultSector: 'ALI.BOI', defaultActivity: 'SALARIE' },
  { code: 'TRAITEUR', nom: 'Traiteur', keywords: ['traiteur', 'événement', 'cérémonie'], sortOrder: 67, sectorCodes: ['ALI.TRA2'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR'], defaultSector: 'ALI.TRA2', defaultActivity: 'INDEPENDANT' },

  // ──────────── SERVICES ────────────

  { code: 'AG_MOBMONEY', nom: 'Agent Mobile Money', keywords: ['mobile money', 'airtel money', 'mtn'], sortOrder: 70, sectorCodes: ['SER.MOB', 'FIN.MIC'], activityTypeCodes: ['INDEPENDANT', 'SALARIE', 'AUTO_ENTREPRENEUR'], defaultSector: 'SER.MOB', defaultActivity: 'INDEPENDANT' },
  { code: 'PHOTOGRAPHE', nom: 'Photographe', keywords: ['photo', 'studio', 'mariage'], sortOrder: 71, sectorCodes: ['SER.PHO', 'CUL.ART'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR', 'ARTISAN'], defaultSector: 'SER.PHO', defaultActivity: 'INDEPENDANT' },
  { code: 'REPARATEUR', nom: 'Réparateur d\'appareils', keywords: ['réparation', 'dépannage', 'électroménager'], sortOrder: 72, sectorCodes: ['SER.REP'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'SER.REP', defaultActivity: 'ARTISAN' },
  { code: 'REP_TEL', nom: 'Réparateur de téléphones', keywords: ['téléphone', 'écran', 'réparation', 'mobile'], sortOrder: 73, sectorCodes: ['TEC.REP', 'SER.REP'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'TEC.REP', defaultActivity: 'ARTISAN' },
  { code: 'GARDIEN', nom: 'Gardien / Vigile', keywords: ['gardiennage', 'vigile', 'sécurité'], sortOrder: 74, sectorCodes: ['SER.GAR'], activityTypeCodes: ['SALARIE', 'JOURNALIER'], defaultSector: 'SER.GAR', defaultActivity: 'SALARIE' },
  { code: 'MENAGERE', nom: 'Aide ménager(ère)', keywords: ['ménage', 'nettoyage', 'maison'], sortOrder: 75, sectorCodes: ['SER.DOM'], activityTypeCodes: ['SALARIE', 'JOURNALIER'], defaultSector: 'SER.DOM', defaultActivity: 'SALARIE' },
  { code: 'BLANCHIS', nom: 'Blanchisseur / Pressing', keywords: ['lavage', 'repassage', 'pressing'], sortOrder: 76, sectorCodes: ['SER.LAV'], activityTypeCodes: ['INDEPENDANT', 'SALARIE', 'ARTISAN'], defaultSector: 'SER.LAV', defaultActivity: 'INDEPENDANT' },
  { code: 'CYBERCAFE', nom: 'Gérant cybercafé', keywords: ['cyber', 'internet', 'impression'], sortOrder: 77, sectorCodes: ['SER.CYB', 'TEC.WEB'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR'], defaultSector: 'SER.CYB', defaultActivity: 'INDEPENDANT' },
  { code: 'MECANICIEN', nom: 'Mécanicien auto/moto', keywords: ['mécanique', 'voiture', 'moto', 'garage'], sortOrder: 78, sectorCodes: ['SER.REP', 'TRA.URB'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'SALARIE'], defaultSector: 'SER.REP', defaultActivity: 'ARTISAN' },

  // ──────────── ÉDUCATION ────────────

  { code: 'ENSEIGNANT', nom: 'Enseignant(e)', keywords: ['professeur', 'école', 'cours', 'instituteur'], sortOrder: 80, sectorCodes: ['EDU.PRI', 'EDU.SEC', 'EDU.SUP'], activityTypeCodes: ['FONCTIONNAIRE', 'SALARIE'], defaultSector: 'EDU.PRI', defaultActivity: 'FONCTIONNAIRE' },
  { code: 'PROF_UNIV', nom: 'Professeur d\'université', keywords: ['université', 'professeur', 'chercheur'], sortOrder: 81, sectorCodes: ['EDU.SUP'], activityTypeCodes: ['FONCTIONNAIRE', 'SALARIE'], defaultSector: 'EDU.SUP', defaultActivity: 'FONCTIONNAIRE' },
  { code: 'FORMATEUR', nom: 'Formateur professionnel', keywords: ['formation', 'stage', 'atelier'], sortOrder: 82, sectorCodes: ['EDU.FOR'], activityTypeCodes: ['INDEPENDANT', 'SALARIE', 'AUTO_ENTREPRENEUR'], defaultSector: 'EDU.FOR', defaultActivity: 'INDEPENDANT' },
  { code: 'REPETITEUR', nom: 'Répétiteur / Cours particuliers', keywords: ['répétiteur', 'soutien', 'cours'], sortOrder: 83, sectorCodes: ['EDU.COU'], activityTypeCodes: ['INDEPENDANT', 'JOURNALIER'], defaultSector: 'EDU.COU', defaultActivity: 'INDEPENDANT' },

  // ──────────── SANTÉ ────────────

  { code: 'MEDECIN', nom: 'Médecin', keywords: ['docteur', 'médecin', 'clinique'], sortOrder: 90, sectorCodes: ['SAN.GEN'], activityTypeCodes: ['SALARIE', 'PROFESSION_LIBERALE', 'FONCTIONNAIRE'], defaultSector: 'SAN.GEN', defaultActivity: 'SALARIE' },
  { code: 'INFIRMIER', nom: 'Infirmier(ère)', keywords: ['infirmier', 'soins', 'hôpital'], sortOrder: 91, sectorCodes: ['SAN.INF', 'SAN.GEN'], activityTypeCodes: ['SALARIE', 'FONCTIONNAIRE'], defaultSector: 'SAN.INF', defaultActivity: 'SALARIE' },
  { code: 'SAGE_FEMME', nom: 'Sage-femme', keywords: ['accouchement', 'maternité', 'naissance'], sortOrder: 92, sectorCodes: ['SAN.GEN'], activityTypeCodes: ['SALARIE', 'FONCTIONNAIRE'], defaultSector: 'SAN.GEN', defaultActivity: 'SALARIE' },
  { code: 'PHARMACIEN', nom: 'Pharmacien(ne)', keywords: ['pharmacie', 'médicament'], sortOrder: 93, sectorCodes: ['SAN.PHA'], activityTypeCodes: ['PROFESSION_LIBERALE', 'SALARIE'], defaultSector: 'SAN.PHA', defaultActivity: 'PROFESSION_LIBERALE' },
  { code: 'LABORANTIN', nom: 'Laborantin / Technicien labo', keywords: ['laboratoire', 'analyse', 'sang'], sortOrder: 94, sectorCodes: ['SAN.GEN'], activityTypeCodes: ['SALARIE', 'FONCTIONNAIRE'], defaultSector: 'SAN.GEN', defaultActivity: 'SALARIE' },
  { code: 'DENTISTE', nom: 'Dentiste', keywords: ['dent', 'dentaire', 'cabinet'], sortOrder: 95, sectorCodes: ['SAN.DEN'], activityTypeCodes: ['PROFESSION_LIBERALE', 'SALARIE'], defaultSector: 'SAN.DEN', defaultActivity: 'PROFESSION_LIBERALE' },
  { code: 'OPTICIEN', nom: 'Opticien', keywords: ['lunette', 'vue', 'optique'], sortOrder: 96, sectorCodes: ['SAN.OPT'], activityTypeCodes: ['SALARIE', 'PROFESSION_LIBERALE'], defaultSector: 'SAN.OPT', defaultActivity: 'SALARIE' },
  { code: 'TRADIPRAT', nom: 'Tradipraticien', keywords: ['traditionnel', 'herbes', 'guérisseur'], sortOrder: 97, sectorCodes: ['SAN.TRA'], activityTypeCodes: ['INDEPENDANT', 'ENTREPRENEUR_INFORMEL'], defaultSector: 'SAN.TRA', defaultActivity: 'INDEPENDANT' },
  { code: 'MASSEUR', nom: 'Masseur / Kinésithérapeute', keywords: ['massage', 'kiné', 'rééducation'], sortOrder: 98, sectorCodes: ['SAN.BIE'], activityTypeCodes: ['INDEPENDANT', 'SALARIE', 'PROFESSION_LIBERALE'], defaultSector: 'SAN.BIE', defaultActivity: 'INDEPENDANT' },

  // ──────────── ADMINISTRATION & FONCTION PUBLIQUE ────────────

  { code: 'AG_ADMIN', nom: 'Agent administratif', keywords: ['administration', 'bureau', 'fonctionnaire'], sortOrder: 100, sectorCodes: ['ADM.CEN', 'ADM.LOC'], activityTypeCodes: ['FONCTIONNAIRE', 'SALARIE'], defaultSector: 'ADM.CEN', defaultActivity: 'FONCTIONNAIRE' },
  { code: 'DOUANIER', nom: 'Douanier', keywords: ['douane', 'frontière', 'marchandise'], sortOrder: 101, sectorCodes: ['ADM.CEN'], activityTypeCodes: ['FONCTIONNAIRE'], defaultSector: 'ADM.CEN', defaultActivity: 'FONCTIONNAIRE' },
  { code: 'POLICIER', nom: 'Policier / Gendarme', keywords: ['police', 'gendarmerie', 'sécurité'], sortOrder: 102, sectorCodes: ['ADM.SEC'], activityTypeCodes: ['FONCTIONNAIRE'], defaultSector: 'ADM.SEC', defaultActivity: 'FONCTIONNAIRE' },
  { code: 'MILITAIRE', nom: 'Militaire', keywords: ['armée', 'soldat', 'militaire'], sortOrder: 103, sectorCodes: ['ADM.SEC'], activityTypeCodes: ['FONCTIONNAIRE'], defaultSector: 'ADM.SEC', defaultActivity: 'FONCTIONNAIRE' },
  { code: 'MAGISTRAT', nom: 'Magistrat / Juge', keywords: ['juge', 'tribunal', 'justice'], sortOrder: 104, sectorCodes: ['ADM.JUS'], activityTypeCodes: ['FONCTIONNAIRE'], defaultSector: 'ADM.JUS', defaultActivity: 'FONCTIONNAIRE' },

  // ──────────── TECHNOLOGIES ────────────

  { code: 'DEV_INFO', nom: 'Développeur informatique', keywords: ['programmeur', 'code', 'logiciel', 'web'], sortOrder: 110, sectorCodes: ['TEC.DEV', 'TEC.WEB'], activityTypeCodes: ['SALARIE', 'INDEPENDANT', 'AUTO_ENTREPRENEUR'], defaultSector: 'TEC.DEV', defaultActivity: 'SALARIE' },
  { code: 'TECH_INFO', nom: 'Technicien informatique', keywords: ['informatique', 'réseau', 'maintenance'], sortOrder: 111, sectorCodes: ['TEC.RES', 'TEC.REP'], activityTypeCodes: ['SALARIE', 'INDEPENDANT', 'ARTISAN'], defaultSector: 'TEC.RES', defaultActivity: 'SALARIE' },
  { code: 'GRAPH_WEB', nom: 'Graphiste / Webdesigner', keywords: ['graphisme', 'design', 'web', 'logo'], sortOrder: 112, sectorCodes: ['TEC.WEB', 'SEN.PUB'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR', 'SALARIE'], defaultSector: 'TEC.WEB', defaultActivity: 'INDEPENDANT' },
  { code: 'COMM_MGR', nom: 'Community Manager', keywords: ['réseaux sociaux', 'digital', 'communication'], sortOrder: 113, sectorCodes: ['TEC.WEB', 'SEN.PUB'], activityTypeCodes: ['SALARIE', 'INDEPENDANT', 'AUTO_ENTREPRENEUR'], defaultSector: 'SEN.PUB', defaultActivity: 'SALARIE' },

  // ──────────── FINANCE ────────────

  { code: 'BANQUIER', nom: 'Agent bancaire', keywords: ['banque', 'guichet', 'caissier'], sortOrder: 120, sectorCodes: ['FIN.BAN'], activityTypeCodes: ['SALARIE'], defaultSector: 'FIN.BAN', defaultActivity: 'SALARIE' },
  { code: 'AG_MICROF', nom: 'Agent de microfinance', keywords: ['microfinance', 'crédit', 'épargne'], sortOrder: 121, sectorCodes: ['FIN.MIC'], activityTypeCodes: ['SALARIE'], defaultSector: 'FIN.MIC', defaultActivity: 'SALARIE' },
  { code: 'COMPTABLE', nom: 'Comptable', keywords: ['comptabilité', 'bilan', 'fiscal'], sortOrder: 122, sectorCodes: ['SEN.COM', 'FIN.BAN'], activityTypeCodes: ['SALARIE', 'PROFESSION_LIBERALE', 'INDEPENDANT'], defaultSector: 'SEN.COM', defaultActivity: 'SALARIE' },
  { code: 'ASSUREUR', nom: 'Agent d\'assurance', keywords: ['assurance', 'police', 'courtier'], sortOrder: 123, sectorCodes: ['FIN.ASS'], activityTypeCodes: ['SALARIE', 'INDEPENDANT'], defaultSector: 'FIN.ASS', defaultActivity: 'SALARIE' },
  { code: 'CHANGEUR', nom: 'Cambiste / Bureau de change', keywords: ['change', 'devise', 'dollar'], sortOrder: 124, sectorCodes: ['FIN.CHA'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR'], defaultSector: 'FIN.CHA', defaultActivity: 'INDEPENDANT' },

  // ──────────── PROFESSIONS LIBÉRALES ────────────

  { code: 'AVOCAT', nom: 'Avocat(e)', keywords: ['avocat', 'droit', 'barreau', 'plaidoirie'], sortOrder: 130, sectorCodes: ['SEN.JUR'], activityTypeCodes: ['PROFESSION_LIBERALE'], defaultSector: 'SEN.JUR', defaultActivity: 'PROFESSION_LIBERALE' },
  { code: 'NOTAIRE', nom: 'Notaire', keywords: ['notaire', 'acte', 'contrat'], sortOrder: 131, sectorCodes: ['SEN.JUR'], activityTypeCodes: ['PROFESSION_LIBERALE'], defaultSector: 'SEN.JUR', defaultActivity: 'PROFESSION_LIBERALE' },
  { code: 'HUISSIER', nom: 'Huissier de justice', keywords: ['huissier', 'signification', 'exécution'], sortOrder: 132, sectorCodes: ['SEN.JUR', 'ADM.JUS'], activityTypeCodes: ['PROFESSION_LIBERALE'], defaultSector: 'SEN.JUR', defaultActivity: 'PROFESSION_LIBERALE' },
  { code: 'ARCHITECTE', nom: 'Architecte', keywords: ['architecture', 'plan', 'bâtiment'], sortOrder: 133, sectorCodes: ['BTP.TOP', 'SEN.CON'], activityTypeCodes: ['PROFESSION_LIBERALE', 'SALARIE'], defaultSector: 'BTP.TOP', defaultActivity: 'PROFESSION_LIBERALE' },
  { code: 'GEOMETRE', nom: 'Géomètre / Topographe', keywords: ['topographie', 'terrain', 'arpentage'], sortOrder: 134, sectorCodes: ['BTP.TOP', 'IMM.VEN'], activityTypeCodes: ['PROFESSION_LIBERALE', 'SALARIE'], defaultSector: 'BTP.TOP', defaultActivity: 'PROFESSION_LIBERALE' },
  { code: 'CONSULTANT', nom: 'Consultant', keywords: ['conseil', 'consultant', 'expertise'], sortOrder: 135, sectorCodes: ['SEN.CON'], activityTypeCodes: ['INDEPENDANT', 'PROFESSION_LIBERALE', 'AUTO_ENTREPRENEUR'], defaultSector: 'SEN.CON', defaultActivity: 'INDEPENDANT' },

  // ──────────── CULTURE, MÉDIAS, SPORT ────────────

  { code: 'MUSICIEN', nom: 'Musicien / Artiste', keywords: ['musique', 'concert', 'artiste', 'chanteur'], sortOrder: 140, sectorCodes: ['CUL.MUS'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR', 'ARTISAN'], defaultSector: 'CUL.MUS', defaultActivity: 'INDEPENDANT' },
  { code: 'DJ', nom: 'DJ / Animateur', keywords: ['DJ', 'animation', 'soirée', 'fête'], sortOrder: 141, sectorCodes: ['CUL.MUS'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR'], defaultSector: 'CUL.MUS', defaultActivity: 'INDEPENDANT' },
  { code: 'JOURNALIST', nom: 'Journaliste', keywords: ['journal', 'presse', 'média', 'radio'], sortOrder: 142, sectorCodes: ['CUL.MED'], activityTypeCodes: ['SALARIE', 'INDEPENDANT'], defaultSector: 'CUL.MED', defaultActivity: 'SALARIE' },
  { code: 'SPORTIF', nom: 'Sportif professionnel', keywords: ['sport', 'football', 'athlète'], sortOrder: 143, sectorCodes: ['CUL.SPO'], activityTypeCodes: ['SALARIE', 'INDEPENDANT'], defaultSector: 'CUL.SPO', defaultActivity: 'SALARIE' },
  { code: 'COACH_SPO', nom: 'Coach sportif', keywords: ['coaching', 'fitness', 'gym'], sortOrder: 144, sectorCodes: ['CUL.SPO'], activityTypeCodes: ['INDEPENDANT', 'AUTO_ENTREPRENEUR', 'SALARIE'], defaultSector: 'CUL.SPO', defaultActivity: 'INDEPENDANT' },
  { code: 'ARTISTE_VIS', nom: 'Artiste peintre / Sculpteur', keywords: ['peinture', 'sculpture', 'art'], sortOrder: 145, sectorCodes: ['CUL.ART'], activityTypeCodes: ['INDEPENDANT', 'ARTISAN'], defaultSector: 'CUL.ART', defaultActivity: 'INDEPENDANT' },

  // ──────────── HÔTELLERIE & TOURISME ────────────

  { code: 'HOTELIER', nom: 'Hôtelier / Gérant d\'hôtel', keywords: ['hôtel', 'chambre', 'réception'], sortOrder: 150, sectorCodes: ['HOT.HEB'], activityTypeCodes: ['INDEPENDANT', 'SALARIE', 'AUTO_ENTREPRENEUR'], defaultSector: 'HOT.HEB', defaultActivity: 'INDEPENDANT' },
  { code: 'GUIDE_TOU', nom: 'Guide touristique', keywords: ['guide', 'tourisme', 'visite'], sortOrder: 151, sectorCodes: ['HOT.TOU'], activityTypeCodes: ['INDEPENDANT', 'SALARIE'], defaultSector: 'HOT.TOU', defaultActivity: 'INDEPENDANT' },
  { code: 'CUISINIER', nom: 'Cuisinier / Chef', keywords: ['cuisine', 'chef', 'restaurant'], sortOrder: 152, sectorCodes: ['ALI.RES', 'HOT.HEB'], activityTypeCodes: ['SALARIE', 'ARTISAN'], defaultSector: 'ALI.RES', defaultActivity: 'SALARIE' },

  // ──────────── IMMOBILIER ────────────

  { code: 'AG_IMMOB', nom: 'Agent immobilier', keywords: ['immobilier', 'location', 'vente'], sortOrder: 160, sectorCodes: ['IMM.VEN', 'IMM.LOC'], activityTypeCodes: ['INDEPENDANT', 'SALARIE', 'AUTO_ENTREPRENEUR'], defaultSector: 'IMM.VEN', defaultActivity: 'INDEPENDANT' },
  { code: 'GERANT_IMM', nom: 'Gérant de biens immobiliers', keywords: ['patrimoine', 'syndic', 'loyer'], sortOrder: 161, sectorCodes: ['IMM.GES', 'IMM.LOC'], activityTypeCodes: ['INDEPENDANT', 'SALARIE'], defaultSector: 'IMM.GES', defaultActivity: 'INDEPENDANT' },

  // ──────────── INDUSTRIE & MINES ────────────

  { code: 'OUVRIER_IND', nom: 'Ouvrier industriel', keywords: ['usine', 'ouvrier', 'production'], sortOrder: 170, sectorCodes: ['IND.AGR', 'IND.BOI', 'IND.TEX'], activityTypeCodes: ['SALARIE', 'JOURNALIER'], defaultSector: 'IND.AGR', defaultActivity: 'SALARIE' },
  { code: 'OUVRIER_MIN', nom: 'Ouvrier minier', keywords: ['mine', 'extraction', 'carrière'], sortOrder: 171, sectorCodes: ['MIN.MIN', 'MIN.SAB'], activityTypeCodes: ['SALARIE', 'JOURNALIER'], defaultSector: 'MIN.MIN', defaultActivity: 'SALARIE' },
  { code: 'TECH_PET', nom: 'Technicien pétrolier', keywords: ['pétrole', 'forage', 'raffinerie'], sortOrder: 172, sectorCodes: ['MIN.PET'], activityTypeCodes: ['SALARIE'], defaultSector: 'MIN.PET', defaultActivity: 'SALARIE' },

  // ──────────── ÉNERGIE & ENVIRONNEMENT ────────────

  { code: 'TECH_SOL', nom: 'Installateur solaire', keywords: ['solaire', 'panneau', 'énergie'], sortOrder: 180, sectorCodes: ['ENV.ENE'], activityTypeCodes: ['ARTISAN', 'INDEPENDANT', 'SALARIE'], defaultSector: 'ENV.ENE', defaultActivity: 'ARTISAN' },
  { code: 'FONTAINIER', nom: 'Fontainier / Foreur', keywords: ['eau', 'forage', 'puits'], sortOrder: 181, sectorCodes: ['ENV.EAU'], activityTypeCodes: ['ARTISAN', 'SALARIE', 'INDEPENDANT'], defaultSector: 'ENV.EAU', defaultActivity: 'ARTISAN' },

  // ──────────── PROFESSIONS SPÉCIALES ────────────

  { code: 'PASTEUR', nom: 'Pasteur / Imam / Prêtre', keywords: ['religion', 'église', 'mosquée', 'culte'], sortOrder: 190, sectorCodes: ['SER'], activityTypeCodes: ['INDEPENDANT', 'SALARIE'], defaultSector: 'SER', defaultActivity: 'INDEPENDANT' },
  { code: 'ONG', nom: 'Travailleur ONG', keywords: ['ONG', 'humanitaire', 'association'], sortOrder: 191, sectorCodes: ['SEN.CON', 'SAN.GEN'], activityTypeCodes: ['SALARIE'], defaultSector: 'SEN.CON', defaultActivity: 'SALARIE' },
  { code: 'CHAUFFEUR_PRIV', nom: 'Chauffeur privé', keywords: ['chauffeur', 'privé', 'personnel'], sortOrder: 192, sectorCodes: ['SER.DOM', 'TRA.URB'], activityTypeCodes: ['SALARIE'], defaultSector: 'SER.DOM', defaultActivity: 'SALARIE' },

  // ──────────── AUTRE ────────────

  { code: 'AUTRE', nom: 'Autre', keywords: [], sortOrder: 999, sectorCodes: [], activityTypeCodes: ['INDEPENDANT', 'SALARIE', 'AUTO_ENTREPRENEUR', 'ENTREPRENEUR_INFORMEL', 'JOURNALIER', 'ARTISAN', 'FONCTIONNAIRE', 'PROFESSION_LIBERALE', 'RETRAITE', 'ETUDIANT', 'SANS_EMPLOI', 'AUTRE'], defaultSector: '', defaultActivity: 'AUTRE' },
];
