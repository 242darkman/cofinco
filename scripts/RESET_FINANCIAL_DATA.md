# Script de Nettoyage des Données Financières

## Vue d'ensemble

Ce script permet de **vider toutes les transactions financières** de la base de données tout en **conservant les données métiers et référentiels**. C'est utile pour :

- Démarrer avec une base propre après des tests
- Nettoyer les données de démonstration avant la mise en production
- Repartir de zéro après une période de test

## Utilisation

```bash
# Mode interactif (avec confirmation)
npm run db:reset-financial

# Mode forcé (sans confirmation, pour scripts CI/CD)
npm run db:reset-financial:force
```

## Ce qui est SUPPRIMÉ ❌

### 1. Grand Livre & Comptabilité
- `ecritures_comptables` - Toutes les écritures comptables
- `lignes_ecritures` - Lignes de détail des écritures
- `gl_posting_links` - Liens entre opérations et écritures
- `declarations_tva` - Déclarations TVA

### 2. Crédits & Remboursements
- `credits` - Tous les crédits actifs
- `echeances_credits` - Échéances de remboursement
- `remboursements` - Historique des remboursements
- `reevaluations_credit` - Réévaluations de crédit
- `credit_refund_requests` - Demandes de remboursement
- `remboursement_echeances` - Allocations de remboursement
- `client_credit_balances` - Soldes clients
- `remboursement_allocation_audit` - Audit des allocations

### 3. Comptes d'Épargne
- `comptes` - Tous les comptes d'épargne
- `transactions_compte` - Transactions sur comptes
- `versements_automatiques` - Versements programmés
- `virements_programmes` - Virements programmés
- `scheduled_transfer_runs` - Exécutions de transferts
- `decaissements_programmes` - Décaissements programmés

### 4. Caisses & Sessions
- `sessions_caisse` - Sessions de caisse
- `operations_caisse` - Opérations de caisse
- `caisse_transferts` - Transferts entre caisses
- `scheduled_caisse_transfers` - Transferts programmés
- `caisse_handovers` - Passations de caisse
- `comptage_billets` - Comptages de billets

### 5. Caisses Agent (Terrain)
- `caisses_agent` - Caisses des agents
- `operations_terrain` - Opérations terrain
- `caisse_code_usages` - Utilisations de codes

### 6. Opérations Terrain
- `remises_terrain` - Remises terrain
- `paiements_terrain` - Paiements terrain
- `remise_items` - Détails des remises
- `agent_mm_payments` - Paiements mobile money

### 7. Coffres-Forts
- `transferts_coffre_caisse` - Transferts coffre ↔ caisse
- `transferts_inter_coffres` - Transferts entre coffres
- `documents_transfert` - Documents de transfert
- `reconciliations_coffre_caisse` - Réconciliations
- `reconciliations_liaison` - Réconciliations de liaison
- `taches_regularisation` - Tâches de régularisation
- `taches_regularisation_coffre_caisse`

### 8. Transferts & Mobile Money
- `transferts` - Transferts entre clients
- `payment_intents` - Intentions de paiement MM
- `provider_events` - Événements des providers
- `loan_payment_allocations` - Allocations de paiements
- `mm_reconciliation_reports` - Rapports de réconciliation
- `otp_validations` - Validations OTP

### 9. Tontines (Opérations)
- `contributions_tontine` - Contributions aux tontines
- `tontine_cycles` - Cycles de tontine
- `tontine_turns` - Tours de tontine
- `tontine_schedules` - Calendriers
- `tontine_distributions` - Distributions
- `tontine_distribution_requests` - Demandes de distribution
- `tontine_turn_audit` - Audit des tours

### 10. Clôtures & Réconciliations
- `agency_daily_closure` - Clôtures journalières
- `agency_closure_blockers` - Blocages de clôture
- `mm_balance_reconciliations` - Réconciliations MM
- `ecarts_approval_requests` - Demandes d'approbation d'écarts

### 11. Facturation
- `factures` - Factures émises
- `lignes_factures` - Lignes de factures

### 12. Mouvements Financiers
- `mouvements_financiers` - Tous les mouvements
- `evenements_outbox` - Événements en attente

### 13. Audit Logs Financiers
- Tous les audit logs liés aux opérations financières
- Logs de transferts, remises, opérations

---

## Ce qui est CONSERVÉ ✅

### 1. Utilisateurs & Authentification
- `users` - Comptes utilisateurs
- `employes` - Profils employés
- Permissions, rôles, sessions actives
- Tentatives de connexion

### 2. Clients
- `clients` - Profils clients
- `types_marches` - Types de marchés
- `tags` et `client_tags` - Tags clients
- `client_activities` - Activités clients
- `historique_points` - Historique de fidélité
- **Note**: Les demandes de crédit (`demandes_credit`) et dossiers (`dossiers_credit`) sont conservés

### 3. Agences & Départements
- `agences` - Agences
- `user_agences` - Affectations
- `departments` - Départements
- `job_positions` - Postes

### 4. Comptabilité (Référentiels)
- `exercices_comptables` - Exercices comptables
- `plan_comptable` - **Plan comptable**
- `journaux_comptables` - **Journaux comptables**
- `gl_periods` - Périodes comptables
- `accounting_rules` - Règles comptables
- `gl_sequences` - Séquences de numérotation

### 5. Finance (Référentiels)
- `credit_plans` - **Plans de crédit**
- `interest_rates` - Taux d'intérêt
- `durees_suggerees` - Durées suggérées
- `produits_compte` - **Produits d'épargne**
- `plans_epargne` - Plans d'épargne
- `objectifs_epargne` - Objectifs d'épargne
- `caisses` - **Définition des caisses** (structure, pas les sessions)

### 6. Tontines (Structure)
- `tontines` - **Tontines** (groupes)
- `membres_tontine` - **Membres** (adhésions)
- `tontine_regles` - Règles
- `tontine_penalites` - Pénalités
- `tontine_plans` - Plans de tontine
- `tontine_rulesets` - Jeux de règles

### 7. Coffres-Forts (Référentiels)
- `coffres_forts` - **Définition des coffres**
- `comptes_liaison` - Comptes de liaison
- Configurations

### 8. Opérations (Référentiels)
- `agents_terrain` - Agents de terrain
- `objectifs_mensuels` - Objectifs
- `prospections` - Prospections
- `visites_terrain` - Visites
- `caisse_security_codes` - Codes de sécurité
- `caisse_assignations` - Assignations
- `caisse_user_authorizations` - Autorisations
- `pos_devices` - Terminaux POS
- `modeles_factures` - **Modèles de factures**
- `zones` - Zones géographiques

### 9. Ressources Humaines
- `demandes_conges` - Demandes de congés
- `formations` - Formations
- `sanctions` - Sanctions
- `candidatures` - Candidatures
- `bulletins_paie` - Bulletins de paie
- `avantages` - Avantages
- `presences` - Présences
- `horaires_travail` - Horaires
- `avances_salaire` - Avances sur salaire

### 10. Modules Agent
- `agent_commissions` - Commissions
- `agent_objectifs` - Objectifs
- `agent_plannings` - Plannings
- `agent_rapports` - Rapports
- `agent_incidents` - Incidents
- `agent_materiel` - Matériel
- `agent_communications` - Communications
- Formations

### 11. Paramètres & Configuration
- `system_settings` - Paramètres système
- `feature_flags` - Flags de fonctionnalités
- `security_settings` - Paramètres de sécurité
- Modèles de notifications (SMS, email)
- Calendriers de maintenance
- Structures de pénalités
- Exceptions de jours fériés
- **Toutes les configurations**

### 12. Notifications & Messagerie
- `notifications` - Notifications système
- `messages` - Messages
- `conversations` - Conversations
- Templates d'emails et SMS
- Préférences de notification

### 13. Transferts (Référentiels)
- `kyc_levels` - Niveaux KYC
- `transfert_limits` - Limites de transfert
- `transfert_webhooks` - Webhooks
- `transfert_blacklist` - Liste noire

### 14. Migrations & Migrations d'agences
- Historique des migrations d'agences
- Logs de migration

---

## Impact sur l'Intégrité

Après l'exécution du script :

1. ✅ **Le plan comptable est intact** - Vous pouvez créer de nouvelles écritures
2. ✅ **Les produits financiers sont conservés** - Plans de crédit et d'épargne disponibles
3. ✅ **Les clients et employés sont présents** - Vous pouvez créer de nouvelles opérations
4. ✅ **Les caisses et coffres sont définis** - Vous devrez ouvrir de nouvelles sessions
5. ⚠️ **Les soldes sont remis à zéro** - Normal, plus de transactions

## Étapes Post-Nettoyage

Après avoir exécuté ce script, vous devrez :

1. **Vérifier l'intégrité** :
   ```bash
   npm run audit:integrity
   ```

2. **Ouvrir de nouvelles sessions de caisse** si nécessaire

3. **Recréer les comptes d'épargne actifs** pour les clients

4. **Reconfigurer les transferts programmés** si besoin

## Avertissements ⚠️

- ❌ **Cette opération est IRRÉVERSIBLE**
- ❌ **Faites une sauvegarde complète avant** (`pg_dump`)
- ❌ **Ne pas exécuter en production** sans backup récent
- ❌ **Tester d'abord sur une copie** de la base de données

## Backup Recommandé

Avant d'exécuter le script :

```bash
# Backup complet de la base
pg_dump -U postgres -d cofinco -F c -f backup_avant_reset_$(date +%Y%m%d_%H%M%S).dump

# Ou backup SQL
pg_dump -U postgres -d cofinco > backup_avant_reset_$(date +%Y%m%d_%H%M%S).sql
```

## Restauration en Cas d'Erreur

Si quelque chose se passe mal :

```bash
# Restaurer depuis le backup
pg_restore -U postgres -d cofinco -c backup_avant_reset_YYYYMMDD_HHMMSS.dump

# Ou depuis SQL
psql -U postgres -d cofinco < backup_avant_reset_YYYYMMDD_HHMMSS.sql
```

## Support

En cas de problème :
1. Vérifiez les logs du script
2. Consultez [scripts/reset-financial-data.sql](./reset-financial-data.sql) pour voir les tables concernées
3. Contactez l'équipe de développement

---

**Dernière mise à jour** : 2026-02-02
