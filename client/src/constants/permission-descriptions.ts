/**
 * Descriptions détaillées des permissions
 * Ce que chaque permission permet de faire exactement
 */

export interface PermissionDescription {
  action: string;
  interface: string;
  details: string[];
}

export const PERMISSION_DESCRIPTIONS: Record<string, PermissionDescription> = {
  // Module Caisse
  'caisse.view': {
    action: 'Voir la caisse',
    interface: 'Accès au module Caisse dans le menu principal',
    details: ['Consulter le solde de caisse', 'Voir l\'historique des transactions', 'Visualiser les rapports de caisse']
  },
  'caisse.open': {
    action: 'Ouvrir une session de caisse',
    interface: 'Bouton "Ouvrir la caisse" dans le module Caisse',
    details: ['Démarrer une nouvelle session de caisse', 'Définir le fonds de caisse initial', 'Saisir le mot de passe de caisse']
  },
  'caisse.close': {
    action: 'Fermer une session de caisse',
    interface: 'Bouton "Fermer la caisse" dans le module Caisse',
    details: ['Clôturer la session en cours', 'Générer le rapport de fermeture', 'Valider le solde final']
  },
  'caisse.deposit': {
    action: 'Effectuer des dépôts',
    interface: 'Onglet "Dépôt" dans le module Caisse',
    details: ['Enregistrer un dépôt client', 'Sélectionner le compte épargne', 'Imprimer le reçu de dépôt']
  },
  'caisse.withdraw': {
    action: 'Effectuer des retraits',
    interface: 'Onglet "Retrait" dans le module Caisse',
    details: ['Enregistrer un retrait client', 'Vérifier le solde disponible', 'Imprimer le reçu de retrait']
  },
  'caisse.transfer': {
    action: 'Effectuer des transferts',
    interface: 'Onglet "Transfert" dans le module Caisse',
    details: ['Transférer entre caisses', 'Transfert vers Mobile Money', 'Transfert inter-agences']
  },
  
  // Module Crédits
  'credits.view': {
    action: 'Voir les crédits',
    interface: 'Accès au module Crédits dans le menu principal',
    details: ['Consulter la liste des crédits', 'Voir les statistiques de crédit', 'Accéder au tableau de bord crédits']
  },
  'credits.create': {
    action: 'Créer une demande de crédit',
    interface: 'Bouton "Nouvelle demande" dans le module Crédits',
    details: ['Remplir le formulaire de demande', 'Sélectionner le type de crédit', 'Définir le montant et la durée']
  },
  'credits.approve': {
    action: 'Approuver un crédit',
    interface: 'Bouton "Approuver" sur une demande de crédit',
    details: ['Valider une demande de crédit', 'Modifier les conditions si nécessaire', 'Générer le contrat de prêt']
  },
  'credits.reject': {
    action: 'Rejeter un crédit',
    interface: 'Bouton "Rejeter" sur une demande de crédit',
    details: ['Refuser une demande', 'Saisir le motif de refus', 'Notifier le client du refus']
  },
  'credits.disburse': {
    action: 'Décaisser un crédit',
    interface: 'Bouton "Décaisser" sur un crédit approuvé',
    details: ['Verser le montant du crédit', 'Choisir le mode de versement', 'Imprimer le bordereau de décaissement']
  },
  'credits.collect': {
    action: 'Collecter les remboursements',
    interface: 'Onglet "Remboursements" dans le module Crédits',
    details: ['Enregistrer un paiement d\'échéance', 'Appliquer des pénalités de retard', 'Imprimer le reçu de paiement']
  },
  'credits.reevaluations.view': {
    action: 'Voir les réévaluations',
    interface: 'Onglet "Réévaluations" dans le module Crédits',
    details: ['Consulter les demandes de réévaluation', 'Voir l\'historique des réévaluations', 'Suivre l\'état d\'avancement']
  },
  'credits.reevaluations.create': {
    action: 'Créer une réévaluation',
    interface: 'Bouton "Demander réévaluation" sur un crédit rejeté',
    details: ['Soumettre une demande de réévaluation', 'Ajouter des éléments nouveaux', 'Joindre des justificatifs']
  },
  'credits.reevaluations.validate': {
    action: 'Valider l\'éligibilité',
    interface: 'Bouton "Valider éligibilité" sur une réévaluation',
    details: ['Vérifier les critères d\'éligibilité', 'Autoriser ou refuser la réévaluation', 'Déclencher une enquête complémentaire']
  },
  'credits.reevaluations.decide': {
    action: 'Décision comité',
    interface: 'Bouton "Enregistrer décision" sur une réévaluation en comité',
    details: ['Approuver ou rejeter définitivement', 'Fixer le montant approuvé', 'Enregistrer les conditions spéciales']
  },
  // Module Clients
  'clients.view': {
    action: 'Voir les clients',
    interface: 'Accès au module Clients dans le menu principal',
    details: ['Consulter la liste des clients', 'Rechercher un client', 'Voir les fiches clients']
  },
  'clients.create': {
    action: 'Créer un nouveau client',
    interface: 'Bouton "Nouveau client" dans le module Clients',
    details: ['Remplir le formulaire d\'inscription', 'Saisir les informations personnelles', 'Télécharger les documents KYC']
  },
  'clients.edit': {
    action: 'Modifier un client',
    interface: 'Bouton "Modifier" sur la fiche client',
    details: ['Mettre à jour les informations', 'Modifier les coordonnées', 'Actualiser les documents']
  },
  'clients.delete': {
    action: 'Supprimer un client',
    interface: 'Bouton "Supprimer" sur la fiche client',
    details: ['Supprimer définitivement le compte', 'Archiver les données client', 'Révoquer l\'accès']
  },
  
  // Module Épargnes
  'epargnes.view': {
    action: 'Voir les épargnes',
    interface: 'Accès au module Épargnes dans le menu principal',
    details: ['Consulter les comptes d\'épargne', 'Voir les soldes', 'Historique des mouvements']
  },
  'epargnes.create': {
    action: 'Créer un compte épargne',
    interface: 'Bouton "Nouveau compte" dans le module Épargnes',
    details: ['Ouvrir un nouveau compte épargne', 'Choisir le type de compte', 'Définir le versement initial']
  },
  'epargnes.deposit': {
    action: 'Effectuer un dépôt épargne',
    interface: 'Bouton "Dépôt" sur un compte épargne',
    details: ['Créditer le compte épargne', 'Saisir le montant', 'Imprimer le reçu']
  },
  'epargnes.withdraw': {
    action: 'Effectuer un retrait épargne',
    interface: 'Bouton "Retrait" sur un compte épargne',
    details: ['Débiter le compte épargne', 'Vérifier les conditions de retrait', 'Appliquer les frais si nécessaire']
  },
  
  // Module Tontines
  'tontines.view': {
    action: 'Voir les tontines',
    interface: 'Accès au module Tontines dans le menu principal',
    details: ['Consulter la liste des tontines', 'Voir les membres', 'Suivre les cotisations']
  },
  'tontines.create': {
    action: 'Créer une tontine',
    interface: 'Bouton "Nouvelle tontine" dans le module Tontines',
    details: ['Définir les paramètres de la tontine', 'Fixer le montant des cotisations', 'Établir le calendrier']
  },
  'tontines.manage': {
    action: 'Gérer une tontine',
    interface: 'Onglet "Gestion" sur une tontine',
    details: ['Ajouter/retirer des membres', 'Enregistrer les cotisations', 'Effectuer les distributions']
  },
  
  // Module Comptabilité
  'comptabilite.view': {
    action: 'Voir la comptabilité',
    interface: 'Accès au module Comptabilité dans le menu principal',
    details: ['Consulter le plan comptable', 'Voir les journaux', 'Accéder aux états financiers']
  },
  'comptabilite.write': {
    action: 'Saisir des écritures',
    interface: 'Bouton "Nouvelle écriture" dans le module Comptabilité',
    details: ['Créer des écritures comptables', 'Lettrer les comptes', 'Valider les écritures']
  },
  'comptabilite.reports': {
    action: 'Générer des rapports',
    interface: 'Onglet "Rapports" dans le module Comptabilité',
    details: ['Générer le bilan', 'Créer le compte de résultat', 'Exporter en PDF/Excel']
  },
  
  // Module Agent Terrain
  'agent.view': {
    action: 'Voir le module Agent',
    interface: 'Accès au module Agent Terrain dans le menu principal',
    details: ['Consulter ses visites', 'Voir ses objectifs', 'Accéder aux statistiques personnelles']
  },
  'agent.collect': {
    action: 'Effectuer des collectes',
    interface: 'Bouton "Nouvelle collecte" dans le module Agent',
    details: ['Enregistrer une collecte sur le terrain', 'Scanner le QR code client', 'Synchroniser avec la caisse']
  },
  'agent.visit': {
    action: 'Enregistrer des visites',
    interface: 'Bouton "Nouvelle visite" dans le module Agent',
    details: ['Créer un rapport de visite', 'Géolocaliser la visite', 'Joindre des photos']
  },
  
  // Module Administration
  'admin.users': {
    action: 'Gérer les utilisateurs',
    interface: 'Onglet "Utilisateurs" dans le module Admin',
    details: ['Créer/modifier des comptes', 'Réinitialiser les mots de passe', 'Bloquer/débloquer des comptes']
  },
  'admin.roles': {
    action: 'Gérer les rôles',
    interface: 'Onglet "Rôles" dans le module Admin',
    details: ['Créer de nouveaux rôles', 'Attribuer des permissions', 'Supprimer des rôles']
  },
  'admin.settings': {
    action: 'Paramètres système',
    interface: 'Onglet "Paramètres" dans le module Admin',
    details: ['Configurer l\'application', 'Modifier les taux', 'Gérer les devises']
  },
  'admin.logs': {
    action: 'Consulter les logs',
    interface: 'Onglet "Logs" dans le module Admin',
    details: ['Voir l\'historique des actions', 'Auditer les connexions', 'Exporter les logs']
  },
  
  // Module Transferts
  'transferts.view': {
    action: 'Voir les transferts',
    interface: 'Accès au module Transferts dans le menu principal',
    details: ['Consulter l\'historique des transferts', 'Voir les tarifs', 'Suivre les transferts en cours']
  },
  'transferts.send': {
    action: 'Envoyer un transfert',
    interface: 'Bouton "Nouveau transfert" dans le module Transferts',
    details: ['Initier un transfert national/international', 'Choisir l\'opérateur Mobile Money', 'Calculer les frais']
  },
  'transferts.receive': {
    action: 'Recevoir un transfert',
    interface: 'Onglet "Réception" dans le module Transferts',
    details: ['Valider la réception', 'Vérifier l\'identité du bénéficiaire', 'Payer le montant']
  },
  
  // Module Rapports
  'rapports.view': {
    action: 'Voir les rapports',
    interface: 'Accès au module Rapports dans le menu principal',
    details: ['Consulter les tableaux de bord', 'Voir les statistiques', 'Accéder aux KPIs']
  },
  'rapports.export': {
    action: 'Exporter les rapports',
    interface: 'Bouton "Exporter" dans le module Rapports',
    details: ['Télécharger en PDF', 'Exporter en Excel', 'Envoyer par email']
  },
  'rapports.schedule': {
    action: 'Planifier des rapports',
    interface: 'Onglet "Planification" dans le module Rapports',
    details: ['Programmer l\'envoi automatique', 'Définir la fréquence', 'Choisir les destinataires']
  }
};

/**
 * Obtenir la description détaillée d'une permission
 */
export function getPermissionDetails(code: string): PermissionDescription {
  return PERMISSION_DESCRIPTIONS[code] || {
    action: 'Action non définie',
    interface: 'Interface non spécifiée',
    details: []
  };
}
