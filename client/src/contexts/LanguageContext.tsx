import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'fr' | 'en';

interface Translations {
  [key: string]: {
    fr: string;
    en: string;
  };
}

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Translations = {
  // Navigation principale
  dashboard: { fr: 'Tableau de bord', en: 'Dashboard' },
  client: { fr: 'Client', en: 'Client' },
  clients: { fr: 'Clients', en: 'Clients' },
  tontines: { fr: 'Tontines', en: 'Tontines' },
  credits: { fr: 'Crédits', en: 'Credits' },
  epargnes: { fr: 'Épargnes', en: 'Savings' },
  agentTerrain: { fr: 'Agent Terrain', en: 'Field Agent' },
  caisse: { fr: 'Caisse', en: 'Cash Register' },
  comptabilite: { fr: 'Comptabilité', en: 'Accounting' },
  rh: { fr: 'RH', en: 'HR' },
  rapports: { fr: 'Rapports', en: 'Reports' },
  parametres: { fr: 'Paramètres', en: 'Settings' },

  modules: { fr: 'Modules', en: 'Modules' },
  navigationRapide: { fr: 'Navigation Rapide', en: 'Quick Navigation' },
  accesRapide: { fr: 'Accédez rapidement à vos modules', en: 'Quick access to your modules' },

  principal: { fr: 'Principal', en: 'Main' },
  gestion: { fr: 'Gestion', en: 'Management' },
  operations: { fr: 'Opérations', en: 'Operations' },
  administration: { fr: 'Administration', en: 'Administration' },

  vueEnsemble: { fr: 'Vue d\'ensemble', en: 'Overview' },
  gestionClients: { fr: 'Gestion des clients', en: 'Client management' },
  gestionTontines: { fr: 'Gestion des tontines', en: 'Tontines management' },
  gestionCredits: { fr: 'Gestion des crédits', en: 'Credit management' },
  comptesEpargne: { fr: 'Comptes d\'épargne', en: 'Savings accounts' },
  gestionAgents: { fr: 'Gestion des agents', en: 'Agent management' },
  operationsCaisse: { fr: 'Opérations de caisse', en: 'Cash operations' },
  gestionComptable: { fr: 'Gestion comptable', en: 'Accounting management' },
  ressourcesHumaines: { fr: 'Ressources Humaines', en: 'Human Resources' },
  generationRapports: { fr: 'Génération de rapports', en: 'Report generation' },
  configurationSysteme: { fr: 'Configuration système', en: 'System configuration' },

  darkMode: { fr: 'Mode Sombre', en: 'Dark Mode' },
  lightMode: { fr: 'Mode Clair', en: 'Light Mode' },
  language: { fr: 'Langue', en: 'Language' },
  french: { fr: 'Français', en: 'French' },
  english: { fr: 'Anglais', en: 'English' },

  cofinPlatform: { fr: 'COFIN&CO-M', en: 'COFIN&CO-M' },
  platformeMicrofinance: { fr: 'Plateforme Microfinance', en: 'Microfinance Platform' },

  // Dashboard
  welcome: { fr: 'Bienvenue', en: 'Welcome' },
  bonjour: { fr: 'Bonjour', en: 'Good morning' },
  bonApresMidi: { fr: 'Bon après-midi', en: 'Good afternoon' },
  bonsoir: { fr: 'Bonsoir', en: 'Good evening' },
  tableauBordIndisponible: { fr: 'Tableau de bord indisponible', en: 'Dashboard unavailable' },
  reessayer: { fr: 'Réessayer', en: 'Retry' },
  derniereMiseAJour: { fr: 'Dernière mise à jour', en: 'Last update' },
  totalClients: { fr: 'Total Clients', en: 'Total Clients' },
  activeClients: { fr: 'actifs', en: 'active' },
  creditsEnCours: { fr: 'Crédits en cours', en: 'Active Credits' },
  enAttente: { fr: 'en attente', en: 'pending' },
  tontinesActives: { fr: 'Tontines Actives', en: 'Active Tontines' },
  surTotal: { fr: 'sur', en: 'of' },
  total: { fr: 'total', en: 'total' },
  volumeCredits: { fr: 'Volume des Crédits', en: 'Credit Volume' },
  totalMontantsOctroyes: { fr: 'Total des montants octroyés', en: 'Total amounts disbursed' },
  agentsTerrain: { fr: 'Agents Terrain', en: 'Field Agents' },
  performanceEquipe: { fr: 'Performance équipe', en: 'Team performance' },
  agentsActifs: { fr: 'agents actifs', en: 'active agents' },
  alertes: { fr: 'Alertes', en: 'Alerts' },
  situationsASurveiller: { fr: 'Situations à surveiller', en: 'Situations to monitor' },
  creditsEnRetard: { fr: 'Crédits en retard', en: 'Overdue Credits' },
  sessionsOuvertes: { fr: 'Sessions ouvertes', en: 'Open Sessions' },
  evolutionSoldes: { fr: 'Évolution des Soldes', en: 'Balance Evolution' },
  evolutionFinanciere: { fr: 'Évolution Financière', en: 'Financial Evolution' },
  
  // Périodes
  jours7: { fr: '7 jours', en: '7 days' },
  jours30: { fr: '30 jours', en: '30 days' },
  mois3: { fr: '3 mois', en: '3 months' },
  an1: { fr: '1 an', en: '1 year' },
  
  // Métriques
  tout: { fr: 'Tout', en: 'All' },
  solde: { fr: 'Solde', en: 'Balance' },
  soldeTotal: { fr: 'Solde Total', en: 'Total Balance' },
  soldeActuel: { fr: 'Solde Actuel', en: 'Current Balance' },
  
  // Transactions
  rechercheTransactions: { fr: 'Recherche de Transactions', en: 'Transaction Search' },
  exporterCSV: { fr: 'Exporter CSV', en: 'Export CSV' },
  transactionsExportees: { fr: 'transaction(s) exportée(s)', en: 'transaction(s) exported' },
  rechercherParDescription: { fr: 'Rechercher par description, référence...', en: 'Search by description, reference...' },
  filtres: { fr: 'Filtres', en: 'Filters' },
  filtresAvances: { fr: 'Filtres avancés', en: 'Advanced filters' },
  reinitialiser: { fr: 'Réinitialiser', en: 'Reset' },
  type: { fr: 'Type', en: 'Type' },
  statut: { fr: 'Statut', en: 'Status' },
  categorie: { fr: 'Catégorie', en: 'Category' },
  trierPar: { fr: 'Trier par', en: 'Sort by' },
  date: { fr: 'Date', en: 'Date' },
  dateDebut: { fr: 'Date début', en: 'Start date' },
  dateFin: { fr: 'Date fin', en: 'End date' },
  montant: { fr: 'Montant', en: 'Amount' },
  montantMin: { fr: 'Montant min', en: 'Min amount' },
  montantMax: { fr: 'Montant max', en: 'Max amount' },
  tous: { fr: 'Tous', en: 'All' },
  toutes: { fr: 'Toutes', en: 'All' },
  credit: { fr: 'Crédit', en: 'Credit' },
  debit: { fr: 'Débit', en: 'Debit' },
  virement: { fr: 'Virement', en: 'Transfer' },
  frais: { fr: 'Frais', en: 'Fees' },
  complete: { fr: 'Complété', en: 'Completed' },
  enAttenteStatus: { fr: 'En attente', en: 'Pending' },
  echoue: { fr: 'Échoué', en: 'Failed' },
  reference: { fr: 'Référence', en: 'Reference' },
  description: { fr: 'Description', en: 'Description' },
  transactionsTrouvees: { fr: 'transaction(s) trouvée(s)', en: 'transaction(s) found' },
  aucuneTransaction: { fr: 'Aucune transaction ne correspond à vos critères', en: 'No transactions match your criteria' },
  
  // Actions communes
  ajouter: { fr: 'Ajouter', en: 'Add' },
  modifier: { fr: 'Modifier', en: 'Edit' },
  supprimer: { fr: 'Supprimer', en: 'Delete' },
  annuler: { fr: 'Annuler', en: 'Cancel' },
  confirmer: { fr: 'Confirmer', en: 'Confirm' },
  enregistrer: { fr: 'Enregistrer', en: 'Save' },
  rechercher: { fr: 'Rechercher', en: 'Search' },
  exporter: { fr: 'Exporter', en: 'Export' },
  importer: { fr: 'Importer', en: 'Import' },
  telecharger: { fr: 'Télécharger', en: 'Download' },
  fermer: { fr: 'Fermer', en: 'Close' },
  voir: { fr: 'Voir', en: 'View' },
  details: { fr: 'Détails', en: 'Details' },
  actions: { fr: 'Actions', en: 'Actions' },
  
  // Sous-menus sidebar
  liste: { fr: 'Liste', en: 'List' },
  carte: { fr: 'Carte', en: 'Map' },
  demandes: { fr: 'Demandes', en: 'Requests' },
  remboursements: { fr: 'Remboursements', en: 'Repayments' },
  comptes: { fr: 'Comptes', en: 'Accounts' },
  transactions: { fr: 'Transactions', en: 'Transactions' },
  journal: { fr: 'Journal', en: 'Journal' },
  bilan: { fr: 'Bilan', en: 'Balance Sheet' },
  tresorerie: { fr: 'Trésorerie', en: 'Cash Flow' },
  agents: { fr: 'Agents', en: 'Agents' },
  visites: { fr: 'Visites', en: 'Visits' },
  zones: { fr: 'Zones', en: 'Zones' },
  session: { fr: 'Session', en: 'Session' },
  cloture: { fr: 'Clôture', en: 'Closing' },
  generateur: { fr: 'Générateur', en: 'Generator' },
  analytique: { fr: 'Analytique', en: 'Analytics' },
  utilisateurs: { fr: 'Utilisateurs', en: 'Users' },
  agences: { fr: 'Agences', en: 'Branches' },
  audit: { fr: 'Audit', en: 'Audit' },
  general: { fr: 'Général', en: 'General' },
  securite: { fr: 'Sécurité', en: 'Security' },
  notifications: { fr: 'Notifications', en: 'Notifications' },
  
  // Login
  connexion: { fr: 'Connexion', en: 'Login' },
  deconnexion: { fr: 'Déconnexion', en: 'Logout' },
  identifiant: { fr: 'Identifiant', en: 'Username' },
  motDePasse: { fr: 'Mot de passe', en: 'Password' },
  seConnecter: { fr: 'Se connecter', en: 'Sign in' },
  motDePasseOublie: { fr: 'Mot de passe oublié ?', en: 'Forgot password?' },
  connexionEnCours: { fr: 'Connexion en cours...', en: 'Signing in...' },
  erreurConnexion: { fr: 'Identifiants incorrects', en: 'Invalid credentials' },
  bienvenueSur: { fr: 'Bienvenue sur', en: 'Welcome to' },
  accesSecurise: { fr: 'Accès sécurisé à votre espace de gestion', en: 'Secure access to your management area' },
  tousDroitsReserves: { fr: 'Tous droits réservés', en: 'All rights reserved' },
  identifiantsInvalides: { fr: 'Identifiant ou mot de passe incorrect', en: 'Invalid username or password' },
  remplirTousChamps: { fr: 'Veuillez remplir tous les champs', en: 'Please fill in all fields' },
  
  // Dashboard Charts
  repartitionProduits: { fr: 'Répartition des Produits', en: 'Product Distribution' },
  statutCredits: { fr: 'Statut des Crédits', en: 'Credit Status' },
  indicateursPerformance: { fr: 'Indicateurs de Performance', en: 'Performance Indicators' },
  tauxCreditsActifs: { fr: 'Crédits actifs', en: 'Active credits' },
  tauxClientsActifs: { fr: 'Clients actifs', en: 'Active clients' },
  tauxAgentsActifs: { fr: 'Agents actifs', en: 'Active agents' },
  tauxRetard: { fr: 'Taux de retard', en: 'Late rate' },
  
  // Clients
  nouveauClient: { fr: 'Nouveau Client', en: 'New Client' },
  listeClients: { fr: 'Liste des Clients', en: 'Client List' },
  informationsClient: { fr: 'Informations Client', en: 'Client Information' },
  nom: { fr: 'Nom', en: 'Name' },
  prenom: { fr: 'Prénom', en: 'First Name' },
  telephone: { fr: 'Téléphone', en: 'Phone' },
  email: { fr: 'Email', en: 'Email' },
  adresse: { fr: 'Adresse', en: 'Address' },
  ville: { fr: 'Ville', en: 'City' },
  profession: { fr: 'Profession', en: 'Occupation' },
  dateNaissance: { fr: 'Date de naissance', en: 'Date of birth' },
  sexe: { fr: 'Sexe', en: 'Gender' },
  homme: { fr: 'Homme', en: 'Male' },
  femme: { fr: 'Femme', en: 'Female' },
  actif: { fr: 'Actif', en: 'Active' },
  inactif: { fr: 'Inactif', en: 'Inactive' },
  
  // Crédits
  nouveauCredit: { fr: 'Nouveau Crédit', en: 'New Credit' },
  demandeCredit: { fr: 'Demande de crédit', en: 'Credit request' },
  montantDemande: { fr: 'Montant demandé', en: 'Requested amount' },
  duree: { fr: 'Durée', en: 'Duration' },
  mois: { fr: 'mois', en: 'months' },
  tauxInteret: { fr: 'Taux d\'intérêt', en: 'Interest rate' },
  mensualite: { fr: 'Mensualité', en: 'Monthly payment' },
  approuve: { fr: 'Approuvé', en: 'Approved' },
  rejete: { fr: 'Rejeté', en: 'Rejected' },
  enCours: { fr: 'En cours', en: 'In progress' },
  rembourse: { fr: 'Remboursé', en: 'Repaid' },
  retard: { fr: 'En retard', en: 'Overdue' },
  echeancier: { fr: 'Échéancier', en: 'Payment schedule' },
  remboursement: { fr: 'Remboursement', en: 'Repayment' },
  
  // Épargnes
  nouveauCompte: { fr: 'Nouveau Compte', en: 'New Account' },
  compteEpargne: { fr: 'Compte Épargne', en: 'Savings Account' },
  depot: { fr: 'Dépôt', en: 'Deposit' },
  retrait: { fr: 'Retrait', en: 'Withdrawal' },
  soldeDisponible: { fr: 'Solde disponible', en: 'Available balance' },
  historiqueTransactions: { fr: 'Historique des transactions', en: 'Transaction history' },
  
  // Tontines
  nouvelleTontine: { fr: 'Nouvelle Tontine', en: 'New Tontine' },
  membres: { fr: 'Membres', en: 'Members' },
  contributions: { fr: 'Contributions', en: 'Contributions' },
  cotisation: { fr: 'Cotisation', en: 'Contribution' },
  frequence: { fr: 'Fréquence', en: 'Frequency' },
  hebdomadaire: { fr: 'Hebdomadaire', en: 'Weekly' },
  mensuel: { fr: 'Mensuel', en: 'Monthly' },
  beneficiaire: { fr: 'Bénéficiaire', en: 'Beneficiary' },
  tour: { fr: 'Tour', en: 'Round' },
  
  // Caisse
  ouvertureCaisse: { fr: 'Ouverture de caisse', en: 'Cash register opening' },
  fermetureCaisse: { fr: 'Fermeture de caisse', en: 'Cash register closing' },
  soldeInitial: { fr: 'Solde initial', en: 'Opening balance' },
  soldeFinal: { fr: 'Solde final', en: 'Closing balance' },
  encaissements: { fr: 'Encaissements', en: 'Receipts' },
  decaissements: { fr: 'Décaissements', en: 'Disbursements' },
  
  // Comptabilité
  journalGeneral: { fr: 'Journal Général', en: 'General Journal' },
  grandLivre: { fr: 'Grand Livre', en: 'General Ledger' },
  balanceGenerale: { fr: 'Balance Générale', en: 'Trial Balance' },
  compteResultat: { fr: 'Compte de Résultat', en: 'Income Statement' },
  ecriture: { fr: 'Écriture', en: 'Entry' },
  debiteur: { fr: 'Débiteur', en: 'Debtor' },
  crediteur: { fr: 'Créditeur', en: 'Creditor' },
  
  // Rapports
  genererRapport: { fr: 'Générer un rapport', en: 'Generate report' },
  rapportJournalier: { fr: 'Rapport journalier', en: 'Daily report' },
  rapportMensuel: { fr: 'Rapport mensuel', en: 'Monthly report' },
  rapportAnnuel: { fr: 'Rapport annuel', en: 'Annual report' },
  
  // Messages et notifications
  chargement: { fr: 'Chargement...', en: 'Loading...' },
  erreur: { fr: 'Erreur', en: 'Error' },
  succes: { fr: 'Succès', en: 'Success' },
  attention: { fr: 'Attention', en: 'Warning' },
  information: { fr: 'Information', en: 'Information' },
  aucunResultat: { fr: 'Aucun résultat', en: 'No results' },
  operationReussie: { fr: 'Opération réussie', en: 'Operation successful' },
  operationEchouee: { fr: 'Opération échouée', en: 'Operation failed' },
  
  // Statistiques
  statistiques: { fr: 'Statistiques', en: 'Statistics' },
  cetteASemaine: { fr: 'cette semaine', en: 'this week' },
  ceMois: { fr: 'ce mois', en: 'this month' },
  cetteAnnee: { fr: 'cette année', en: 'this year' },
  nouveauxClients: { fr: 'Nouveaux clients', en: 'New clients' },
  nouveauxCredits: { fr: 'Nouveaux crédits', en: 'New credits' },
  
  // Rôles
  administrateur: { fr: 'Administrateur', en: 'Administrator' },
  chefAgence: { fr: 'Chef d\'Agence', en: 'Branch Manager' },
  comptable: { fr: 'Comptable', en: 'Accountant' },
  gestionnaireCredit: { fr: 'Gestionnaire Crédit', en: 'Credit Manager' },
  superviseur: { fr: 'Superviseur', en: 'Supervisor' },
  agent: { fr: 'Agent', en: 'Agent' },
  agentCaisse: { fr: 'Agent Caisse', en: 'Cashier Agent' },
  
  // Résumé financier
  resumeFinancier: { fr: 'Résumé Financier', en: 'Financial Summary' },
  clientsActifs: { fr: 'Clients Actifs', en: 'Active Clients' },
  creditsEnAttenteLabel: { fr: 'Crédits en Attente', en: 'Pending Credits' },
  sessionsCaisse: { fr: 'Sessions Caisse', en: 'Cash Sessions' },
  volumeEpargnes: { fr: 'Volume Épargnes', en: 'Savings Volume' },
  aRecouvrer: { fr: 'à recouvrer', en: 'to recover' },
  performanceEquipeLabel: { fr: 'Performance Équipe', en: 'Team Performance' },
  supervisionOperations: { fr: 'Supervision des Opérations', en: 'Operations Supervision' },
  tauxRecouvrement: { fr: 'Taux de recouvrement estimé', en: 'Estimated recovery rate' },
  ouvertes: { fr: 'ouvertes', en: 'open' },
  creditsActifs: { fr: 'crédits actifs', en: 'active credits' },
  
  // Dashboard supplémentaire
  agentsActifsLabel: { fr: 'Agents Actifs', en: 'Active Agents' },
  clientsTotal: { fr: 'Clients Total', en: 'Total Clients' },
  creditsActifsLabel: { fr: 'Crédits Actifs', en: 'Active Credits' },
  nouveauxClients7j: { fr: 'Nouveaux clients (7j)', en: 'New clients (7d)' },
  nouveauxCredits7j: { fr: 'Nouveaux crédits (7j)', en: 'New credits (7d)' },
  activiteDuJour: { fr: 'Activité du Jour', en: 'Today\'s Activity' },
  agentsSurTerrain: { fr: 'Agents sur le terrain', en: 'Agents in the field' },
  comptesActifs: { fr: 'comptes actifs', en: 'active accounts' },
  accesRapideLabel: { fr: 'Accès Rapide', en: 'Quick Access' },
  nouvelleEpargne: { fr: 'Nouvelle Épargne', en: 'New Savings' },
  nouveauCreditLabel: { fr: 'Nouveau Crédit', en: 'New Credit' },
  enAttenteLabel: { fr: 'En Attente', en: 'Pending' },
  aTraiter: { fr: 'à traiter', en: 'to process' },
  enRetard: { fr: 'En Retard', en: 'Overdue' },
  indicateursCles: { fr: 'Indicateurs Clés', en: 'Key Indicators' },
  totalCreditsLabel: { fr: 'Total crédits', en: 'Total credits' },
  
  // Menu latéral
  menuDashboard: { fr: 'Dashboard', en: 'Dashboard' },
  menuClients: { fr: 'Clients', en: 'Clients' },
  menuTontines: { fr: 'Tontines', en: 'Tontines' },
  menuCredits: { fr: 'Crédits', en: 'Credits' },
  menuEpargnes: { fr: 'Épargnes', en: 'Savings' },
  menuAgentTerrain: { fr: 'Agent de Terrain', en: 'Field Agent' },
  menuTerrain: { fr: 'Agent de Terrain', en: 'Field' },
  menuCaisse: { fr: 'Caisse', en: 'Cash Register' },
  menuCoffre: { fr: 'Coffre-Fort', en: 'Safe' },
  menuTransfert: { fr: 'Transfert', en: 'Money Transfer' },
  menuBourse: { fr: 'Bourse', en: 'Stock Market' },
  menuExcel: { fr: 'Excel', en: 'Excel' },
  menuRH: { fr: 'RH', en: 'HR' },
  menuComptabilite: { fr: 'Comptabilité', en: 'Accounting' },
  menuRapports: { fr: 'Rapports', en: 'Reports' },
  menuParametres: { fr: 'Paramètres', en: 'Settings' },
  menuAdministrateur: { fr: 'Administrateur', en: 'Administrator' },
  menuAdmin: { fr: 'Administration', en: 'Administration' },
  menuMessages: { fr: 'Messages', en: 'Messages' },
  menuProfil: { fr: 'Profil', en: 'Profile' },
  accueil: { fr: 'Accueil', en: 'Home' },
  securise: { fr: 'Sécurisé', en: 'Secured' },
  rechercherClientCreditTransaction: { fr: 'Rechercher un client, crédit, transaction...', en: 'Search a client, credit, transaction...' },
  modulesPrincipaux: { fr: 'Modules Principaux', en: 'Main Modules' },
  activiteRecente: { fr: 'Activité Récente', en: 'Recent Activity' },
  retourListe: { fr: 'Retour à la liste', en: 'Back to list' },
  creditApprouve: { fr: 'Crédit approuvé pour Marie Sengele', en: 'Credit approved for Marie Sengele' },
  nouveauClientAjoute: { fr: 'Nouveau client ajouté', en: 'New client added' },
  rapportMensuelGenere: { fr: 'Rapport mensuel généré', en: 'Monthly report generated' },
  collecteTerrainEffectuee: { fr: 'Collecte terrain effectuée', en: 'Field collection completed' },
  epargnesTotales: { fr: 'Épargnes Totales', en: 'Total Savings' },
  transactionsLabel: { fr: 'Transactions', en: 'Transactions' },
  sauvegarder: { fr: 'Sauvegarder', en: 'Save' },
  erreurChargement: { fr: 'Erreur lors du chargement', en: 'Loading error' },
  
  // Notifications et messages
  clientCreeSucces: { fr: 'Client créé avec succès!', en: 'Client created successfully!' },
  clientMisAJourSucces: { fr: 'Client mis à jour avec succès!', en: 'Client updated successfully!' },
  clientSupprimeSucces: { fr: 'Client supprimé avec succès!', en: 'Client deleted successfully!' },
  erreurChargementClients: { fr: 'Erreur lors du chargement des clients', en: 'Error loading clients' },
  erreurCreation: { fr: 'Erreur lors de la création', en: 'Creation error' },
  erreurMiseAJour: { fr: 'Erreur lors de la mise à jour', en: 'Update error' },
  erreurSuppression: { fr: 'Erreur lors de la suppression', en: 'Deletion error' },
  veuilleezConnecter: { fr: 'Veuillez vous connecter pour voir le tableau de bord', en: 'Please login to view the dashboard' },
  erreurChargementStats: { fr: 'Erreur lors du chargement des statistiques', en: 'Error loading statistics' },
  impossibleChargerStats: { fr: 'Impossible de charger les statistiques', en: 'Unable to load statistics' },
  confirmerSuppression: { fr: 'Voulez-vous vraiment supprimer ce client?', en: 'Are you sure you want to delete this client?' },
  
  // Boutons et actions supplémentaires
  paiement: { fr: 'Paiement', en: 'Payment' },
  rapport: { fr: 'Rapport', en: 'Report' },
  actualiser: { fr: 'Actualiser', en: 'Refresh' },
  importCsv: { fr: 'Import CSV', en: 'Import CSV' },
  
  // Status système
  systemeOk: { fr: 'Système OK', en: 'System OK' },
  baseDonneesActive: { fr: 'Base de données active', en: 'Database active' },
  
  // Gestion clients supplémentaires
  clientsTrouves: { fr: 'client(s) trouvé(s)', en: 'client(s) found' },
  rechercherClient: { fr: 'Rechercher par nom, email ou téléphone...', en: 'Search by name, email or phone...' },
  tousStatuts: { fr: 'Tous les statuts', en: 'All statuses' },
  suspendu: { fr: 'Suspendu', en: 'Suspended' },
  nouveau: { fr: 'Nouveau', en: 'New' },
  chargementClients: { fr: 'Chargement des clients...', en: 'Loading clients...' },
  aucunClientTrouve: { fr: 'Aucun client trouvé', en: 'No client found' },
  voirDetails: { fr: 'Voir détails', en: 'View details' },
  
  // Onglets client supplémentaires
  kyc: { fr: 'KYC', en: 'KYC' },
  notes: { fr: 'Notes', en: 'Notes' },
  analytics: { fr: 'Analytics', en: 'Analytics' },
  historique: { fr: 'Historique', en: 'History' },
  scoreSegment: { fr: 'Score & Segment', en: 'Score & Segment' },
  
  // Module loading
  chargementModule: { fr: 'Chargement du module...', en: 'Loading module...' },
  
  // Client details
  finances: { fr: 'Finances', en: 'Finances' },
  contact: { fr: 'Contact', en: 'Contact' },
  exportCsvSucces: { fr: 'Export CSV réussi!', en: 'CSV export successful!' },
  score: { fr: 'Score', en: 'Score' },
  segment: { fr: 'Segment', en: 'Segment' },
  pointsFidelite: { fr: 'Points', en: 'Points' },
  status: { fr: 'Status', en: 'Status' },
  
  // Segments
  tousSegments: { fr: 'Tous les segments', en: 'All segments' },
  premium: { fr: 'Premium', en: 'Premium' },
  
  // Welcome message
  bienvenueCofin: { fr: 'Bienvenue sur COFIN&CO-M', en: 'Welcome to COFIN&CO-M' },
  gestionMicrofinance: { fr: 'Gestion complète de microfinance', en: 'Complete microfinance management' },
  
  // Agences
  agenceCentrale: { fr: 'Agence Centrale', en: 'Central Branch' },
  kinshasaNord: { fr: 'Kinshasa Nord', en: 'Kinshasa North' },
  kinshasaSud: { fr: 'Kinshasa Sud', en: 'Kinshasa South' },
  matadi: { fr: 'Matadi', en: 'Matadi' },
  lubumbashi: { fr: 'Lubumbashi', en: 'Lubumbashi' },

  // OTP Validation - Mobile Money
  validationSecurisee: { fr: 'Validation Sécurisée', en: 'Secure Validation' },
  codeOtp: { fr: 'Code OTP', en: 'OTP Code' },
  generationCode: { fr: 'Génération du code...', en: 'Generating code...' },
  envoiSmsClient: { fr: 'Envoi du SMS au client', en: 'Sending SMS to client' },
  codeRecuClient: { fr: 'Code reçu par le client', en: 'Code received by client' },
  tentativesRestantes: { fr: 'Tentatives restantes', en: 'Remaining attempts' },
  validerTransaction: { fr: 'Valider la Transaction', en: 'Validate Transaction' },
  renvoyerCode: { fr: 'Renvoyer le code', en: 'Resend code' },
  validationEnCours: { fr: 'Validation en cours...', en: 'Validating...' },
  transactionValidee: { fr: 'Transaction Validée !', en: 'Transaction Validated!' },
  smsConfirmationEnvoye: { fr: 'SMS de confirmation envoyé au client', en: 'Confirmation SMS sent to client' },
  codeExpire: { fr: 'Le code a expiré. Veuillez générer un nouveau code.', en: 'Code expired. Please generate a new code.' },
  genererNouveauCode: { fr: 'Générer un nouveau code', en: 'Generate new code' },
  securiteOtp: { fr: 'Le client a reçu un code à 6 chiffres par SMS. Demandez-lui de vous communiquer ce code pour valider la transaction.', en: 'The client received a 6-digit code via SMS. Ask them to provide this code to validate the transaction.' },
  saisir6Chiffres: { fr: 'Veuillez saisir les 6 chiffres du code', en: 'Please enter the 6-digit code' },
  erreurGenerationOtp: { fr: 'Erreur lors de la génération du code', en: 'Error generating OTP code' },
  impossibleGenererOtp: { fr: 'Impossible de générer le code OTP', en: 'Unable to generate OTP code' },
  erreurValidation: { fr: 'Erreur lors de la validation', en: 'Validation error' },
  codeInvalide: { fr: 'Code invalide', en: 'Invalid code' },

  // Mode Offline / Synchronisation
  offlineMode: { fr: 'Mode hors ligne', en: 'Offline mode' },
  syncing: { fr: 'Synchronisation...', en: 'Syncing...' },
  pendingSync: { fr: 'en attente', en: 'pending' },
  online: { fr: 'En ligne', en: 'Online' },
  syncStatus: { fr: 'État de synchronisation', en: 'Sync status' },
  connected: { fr: 'Connecté au serveur', en: 'Connected to server' },
  noConnection: { fr: 'Pas de connexion', en: 'No connection' },
  pendingOperations: { fr: 'En attente', en: 'Pending' },
  synced: { fr: 'Synchronisées', en: 'Synced' },
  failed: { fr: 'Échouées', en: 'Failed' },
  conflicts: { fr: 'Conflits', en: 'Conflicts' },
  lastSync: { fr: 'Dernière sync', en: 'Last sync' },
  syncNow: { fr: 'Synchroniser maintenant', en: 'Sync now' },
  offlineNotice: { fr: 'Vos opérations sont enregistrées localement et seront synchronisées automatiquement dès que la connexion sera rétablie.', en: 'Your operations are saved locally and will be automatically synced when the connection is restored.' },
  offlineSaved: { fr: 'Opération enregistrée hors ligne', en: 'Operation saved offline' },
  syncComplete: { fr: 'Synchronisation terminée', en: 'Sync complete' },
  syncFailed: { fr: 'Échec de synchronisation', en: 'Sync failed' },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('language');
    return (saved as Language) || 'fr';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
