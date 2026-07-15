/**
 * Module central pour la gestion des données financières.
 * Ce fichier agit comme un point d'entrée unique (barrel file) pour tous les sous-modules de finance,
 * garantissant la rétrocompatibilité des imports existants dans les contrôleurs et les services.
 * 
 * Il réexporte les fonctionnalités liées aux :
 * - Opérations de caisse et sessions
 * - Comptes, transactions et épargne
 * - Crédits, demandes, et échéanciers
 * - Factures et paiements
 * - Métadonnées, types et erreurs spécifiques
 */
export * from "./finance/credits";
export * from "./finance/comptes";
export * from "./finance/caisse";
export * from "./finance/operations";
export * from "./finance/factures";
export * from "./finance/agences";
export * from "./finance/durees";
export * from "./finance/workflows";
export * from "./finance/misc";
