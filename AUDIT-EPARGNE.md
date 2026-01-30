# AUDIT COMPLET : Module EPARGNE (Comptes / Transactions / Plans / Objectifs) - COFIN&CO-M

**Date**: 2026-01-27
**Scope**: Backend (29 routes) + Frontend (10 composants) + Temps reel + Ledger + GL

---

## TABLE DES MATIERES

1. [MATRICE EPARGNE](#1-matrice-epargne)
2. [MATRICE OPERATIONS COMPTES](#2-matrice-operations-comptes)
3. [MATRICE TRANSFERTS PROGRAMMES](#3-matrice-transferts-programmes)
4. [MATRICE GESTION COMPTE (Blocage/Cloture/Agence)](#4-matrice-gestion-compte)
5. [MATRICE FRONTEND](#5-matrice-frontend)
6. [RECAPITULATIF SOURCE DE VERITE](#6-recapitulatif-source-de-verite)
7. [LISTE DES GAPS P0/P1/P2](#7-liste-des-gaps)
8. [PLAN TEMPS REEL EPARGNE](#8-plan-temps-reel-epargne)
9. [AUDIT FRONTEND DETAILLE](#9-audit-frontend-detaille)
10. [PLAN D'IMPLEMENTATION](#10-plan-dimplementation)

---

## 1. MATRICE EPARGNE - Flux Compte (Creation / Consultation)

| # | Feature/Ecran | Action utilisateur | Endpoint(s) | Service(s) | Tables impactees | Source de verite (champs) | Statuts backend attendus | Regles metiers/guards | Idempotency key | Mouvements crees | GL posting | Events WS emis | Front Query Keys | Affichage UI | Traduction FR | Temps reel | Tests requis | Edge cases | Risque + Correctifs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E1 | Creer Compte | Formulaire 3 etapes | `POST /api/comptes` | comptesService.createCompteWithInitialDeposit | comptes, (mouvementsFinanciers si depot initial), (transactionsCompte si depot) | comptes.statut, .soldeCourant, .numeroCompte | PENDING_ACTIVATION (si depot initial CASH), ACTIVE (si depot virement/zero) | - permission MANAGE.COMPTE, client actif, 1 compte/type/client, produit valide | numeroCompte (unique gen) | OUI si soldeInitial > 0 (INITIAL_DEPOSIT ou DEPOSIT_SAVINGS) | OUI sync si mouvement cree | DASHBOARD_UPDATE | compteKeys.all, compteKeys.lists(), compteKeys.pendingActivation() | Onglet Epargnes, KPI cards | "Compte cree avec succes !" | Oui via DASHBOARD_UPDATE | Unit: unicite type/client, Integ: creation+depot atomique, E2E: formulaire 3 etapes | Doublon type/client, produit inexistant, montant negatif, virement interne solde insuffisant | P1 - Unicite DB OK |
| E2 | Lister Comptes | Navigation onglets | `GET /api/comptes` | storage.getAllComptesWithClients | comptes, clients, users (lecture) | comptes.typeCompte, .statut, .soldeCourant | - | permission VIEW, agence access | - | NON | NON | - | compteKeys.all, compteKeys.lists({typeCompte, statut, search, page}) | Onglet principal, table paginee | "Gestion des Comptes" | Non (polling via useState) | Integ: pagination, filtres | Grand volume sans pagination (limit=15 OK), search debounce | **P0** - Voir GAP #1 |
| E3 | Stats Comptes | Chargement auto | `GET /api/comptes/stats` | SQL aggregation | comptes, produitsCompte (lecture) | comptes.soldeCourant (SUM), comptes.statut (COUNT) | - | agence access | - | NON | NON | - | ['comptes-stats'] | KPI cards (Solde Total, Comptes actifs, Flux du jour) | "Solde Total", "Comptes {type}", "Flux du jour" | Non (polling via useState) | Unit: calcul taux moyen, Integ: filtrage agence | Agence sans comptes, division par zero taux moyen | P2 |
| E4 | Detail Compte | Clic sur compte | `GET /api/comptes/:id` | comptesService.canWithdraw/canDeposit | comptes (lecture) | comptes.statut, .soldeCourant, .blocageActif | - | auth | - | NON | NON | - | compteKeys.detail(id) | AccountDetailSlideOver | "Solde Disponible", "Historique" | Non | Integ: permissions retrait/depot | Compte inexistant, compte supprime soft | P2 |
| E5 | Historique Transactions | Onglet Historique | `GET /api/comptes/:id/transactions` | comptesService.getCompteTransactions | mouvementsFinanciers (lecture) | mouvementsFinanciers.* | - | auth | - | NON | NON | - | compteKeys.transactions(id) | Liste dans SlideOver | "Historique" | Non (fetch manuel) | Integ: tri par date, limit | Pas de pagination (limit=50 par defaut) | P2 |
| E6 | Stats Evolution | Graphique evolution | `GET /api/comptes/:id/stats` | comptesService.getCompteStats | comptes, mouvementsFinanciers (lecture) | - | - | auth | - | NON | NON | - | compteKeys.stats(id) | Graphique (non implemente front?) | "Evolution" | Non | Integ: periodes 1M/3M/6M/1Y | Compte recent sans historique | P2 |
| E7 | Produits Compte | Dropdown dans formulaire | `GET /api/produits-compte` | SQL query | produitsCompte (lecture) | produitsCompte.tauxInteret, .actif | - | agence access | - | NON | NON | - | ['produits-compte'] | Dropdown formulaire creation | "Produit de Compte", "Taux d'interet: X%/an" | Non | Unit: filtrage typeCompte | Aucun produit actif pour le type | P2 |
| E8 | Comptes en Attente | Liste activation | `GET /api/comptes/pending-activation` | SQL query | comptes, clients, users (lecture) | comptes.statut = PENDING_ACTIVATION | PENDING_ACTIVATION | permission VIEW.COMPTE, agence | - | NON | NON | - | compteKeys.pendingActivation() | Liste "En attente d'activation" (FIFO) | "Activation Requise" | Oui via DASHBOARD_UPDATE | Integ: ordre FIFO (createdAt ASC) | Compte supprime entre list et activation | P1 |
| E9 | Check Compte | Verifier numero compte | `GET /api/accounts/check/:accountNumber` | SQL query | comptes, clients, users (lecture) | comptes.numeroCompte | - | agence access | - | NON | NON | - | - (usage ponctuel) | Modal de transfert | "Compte trouve: {nom}" | Non | Unit: format numero | Numero inexistant, mauvais format | P2 |
| E10 | Portfolio Client | Voir tout le client | `GET /api/clients/:id/portfolio` | comptesService.getClientPortfolio | comptes, credits, tontines (lecture) | - | - | auth | - | NON | NON | - | - | Page detail client | "Portfolio" | Non | Integ: aggregation correcte | Client sans comptes/credits/tontines | P2 |
| E11 | Eligibilite Creation | Auto-verification | `GET /api/clients/:id/can-create-compte/:type` | comptesService.clientHasCompteOfType | comptes (lecture) | - | - | auth | - | NON | NON | - | - | Formulaire creation (disable type) | "Compte existant" | Non | Unit: 1 type/client | Race condition creation parallele | P2 - Unicite DB backup |

---

## 2. MATRICE OPERATIONS COMPTES (Depot / Retrait / Activation)

| # | Feature/Ecran | Action utilisateur | Endpoint(s) | Service(s) | Tables impactees | Source de verite | Statuts backend | Regles/guards | Idempotency key | Mouvements | GL posting | Events WS | Query Keys | UI | Traduction FR | Temps reel | Tests requis | Edge cases | Risque |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E12 | Depot Epargne | Formulaire depot | `POST /api/comptes/:id/depot` | comptesService.deposerSurCompte, ledger | comptes(.soldeCourant), mouvementsFinanciers, transactionsCompte, operationsCaisse (si CASH), factures | comptes.soldeCourant += montant, mouvementsFinanciers.reference | POSTED (mouvement), ACTIVE (compte) | - permission CREATE.CAISSE_OPERATION, compte ACTIVE ou PENDING, montant > 0, session caisse (si CASH) | idempotencyKey (optionnel) | OUI (DEPOSIT_SAVINGS/DEPOSIT_CURRENT/DEPOSIT_BLOCKED, EPARGNE/CAISSE) | OUI sync (D:521/531 C:compte_epargne) | LIVE_ACTIVITY, DASHBOARD_UPDATE, CAISSE_UPDATE(action=DEPOT) | compteKeys.all, caisseKeys, dashboardKeys | EpargneTransactionForm (type=depot) | "Confirmer Depot", "Depot effectue" | Oui via DASHBOARD_UPDATE + LIVE_ACTIVITY | Unit: calcul soldeApres, Integ: mouvement+GL+solde atomique, E2E: depot CASH avec billetage | Double depot (idempotency), session fermee, montant > MAX, depot sur compte CLOSED | **P0** - Idempotency OK |
| E13 | Retrait Epargne | Formulaire retrait | `POST /api/comptes/:id/retrait` | comptesService.retirerDuCompte, ledger | comptes(.soldeCourant), mouvementsFinanciers, transactionsCompte, operationsCaisse (si CASH) | comptes.soldeCourant -= montant | POSTED (mouvement), ACTIVE (compte) | - permission CREATE.CAISSE_OPERATION, compte ACTIVE, non bloque (blocageActif=false), montant <= soldeCourant, session caisse (si CASH) | idempotencyKey (optionnel) | OUI (WITHDRAWAL_SAVINGS/WITHDRAWAL_CURRENT, EPARGNE/CAISSE) | OUI sync (D:compte_epargne C:521/531) | NOTIFICATION(admin), LIVE_ACTIVITY, DASHBOARD_UPDATE, CAISSE_UPDATE(action=RETRAIT) | compteKeys.all, caisseKeys, dashboardKeys | EpargneTransactionForm (type=retrait) | "Confirmer Retrait", "Retrait effectue" | Oui via DASHBOARD_UPDATE + LIVE_ACTIVITY | Unit: validation solde, Integ: mouvement+GL+solde, E2E: retrait avec validation | Solde insuffisant (INSUFFICIENT_BALANCE, 403), compte bloque (WITHDRAWAL_NOT_ALLOWED, 403), doublon (DUPLICATE_OPERATION, 409) | **P0** - Guards solides |
| E14 | Depot Initial (Activation) | Bouton "Encaisser" | `POST /api/comptes/:id/depot-initial` | comptesService.payerDepotInitialCompte, ledger | comptes(.soldeCourant, .statut -> ACTIVE), mouvementsFinanciers, transactionsCompte | comptes.statut = ACTIVE, comptes.soldeCourant = montant | ACTIVE (compte), POSTED (mouvement) | - permission CREATE.CAISSE_OPERATION, compte PENDING_ACTIVATION, montant correct, session caisse | - | OUI (INITIAL_DEPOSIT, EPARGNE) | OUI sync | LIVE_ACTIVITY, DASHBOARD_UPDATE | compteKeys.all, compteKeys.pendingActivation() | EpargneTransactionForm (mode=activation), AccountDetailSlideOver | "Encaisser et Activer le compte", "Compte active" | Oui via DASHBOARD_UPDATE | Unit: transition PENDING->ACTIVE, Integ: mouvement+activation atomique, E2E: flux creation->activation | Activation d'un compte deja ACTIVE, montant different du depot initial prevu, session fermee | **P0** - Transition statut OK |
| E15 | Calcul Interets | Bouton "Crediter" | `POST /api/transactions-epargne` + `PATCH /api/comptes/:id` | **AUCUN service backend dedie** (frontend fait 2 appels) | comptes(.soldeCourant), transactionsCompte | comptes.soldeCourant += interets | POSTED (transaction) | - auth, montant > 0 | - | **NON** (gap: pas de mouvement ledger!) | **NON** (gap: pas de GL posting!) | NON | compteKeys (reload manuel) | EpargneInterestCalculator | "Crediter les Interets", "Interets Calcules" | Non | Unit: formule interets, Integ: creditation atomique | **Creditation sans mouvement ledger = fuite comptable**, race condition 2 appels, arrondi interets | **P0** - Voir GAP #3 |
| E16 | Capitalisation Auto (CRON) | Automatique 1er du mois | Scheduler interne | InterestSchedulerService.runMonthlyCapitalization, ledger.executeWithLedger | comptes(.soldeCourant, .accruedInterest, .dateDerniereCapitalisation), mouvementsFinanciers, transactionsCompte | comptes.soldeCourant += accruedInterest, comptes.accruedInterest = 0 | POSTED | - compte ACTIVE, solde > 0, accruedInterest >= 0.01 | `INTEREST-CAP-{compteId}-{mois}` | OUI (INTEREST_PAYMENT, SYSTEME) | OUI sync | INTEREST_CAPITALIZED (domain event) | compteKeys (si WS branche) | Aucun (background) | "Capitalisation des interets" | Oui via domain event | Unit: seuil 0.01, Integ: mouvement+solde atomique | Double run meme mois (idempotency), compte ferme entre accrual et capitalisation | P1 - Idempotency OK |
| E17 | Accrual Quotidien (CRON) | Automatique minuit | Scheduler interne | InterestSchedulerService.runDailyAccrual | comptes(.accruedInterest) | comptes.accruedInterest += daily_interest | - | - compte ACTIVE, solde > 0, taux > 0 | - | NON | NON | NON | - | Aucun | - | Non | Unit: formule (solde*taux/100)/365, Integ: batch update | Taux change en milieu de mois, nouveau compte (0 jours) | P2 |

---

## 3. MATRICE TRANSFERTS PROGRAMMES (Virements Automatiques)

| # | Feature/Ecran | Action utilisateur | Endpoint(s) | Service(s) | Tables impactees | Source de verite | Statuts backend | Regles/guards | Idempotency key | Mouvements | GL posting | Events WS | Query Keys | UI | Traduction FR | Temps reel | Tests requis | Edge cases | Risque |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E18 | Transfert Immediat | Formulaire virement | `POST /api/comptes/transferts` (scheduled=false) | comptesService.executeCompteTransfer, ledger | comptes(source.soldeCourant-=, dest.soldeCourant+=), mouvementsFinanciers, transactionsCompte (x2) | comptes.soldeCourant (source et dest) | POSTED | - permission CREATE.CAISSE_OP, source ACTIVE, solde suffisant, dest existe | idempotencyKey | OUI (TRANSFER_OUT + TRANSFER_IN, COMPTE) | OUI sync | DASHBOARD_UPDATE (implicite) | compteKeys.all, compteKeys.transactions() | Modal "Virement interne" | "Virement effectue" | Oui | Unit: double update solde, Integ: atomicite 2 comptes, E2E: virement complet | Meme compte source=dest, solde insuffisant, dest CLOSED, race condition | **P0** - Transaction atomique OK |
| E19 | Planifier Transfert | Formulaire virement programme | `POST /api/comptes/transferts` (scheduled=true) | SQL insert | virementsProgrammes | virementsProgrammes.actif, .prochaineExecution | PENDING | permission CREATE.CAISSE_OP, comptes existent | - | NON (pas encore execute) | NON | NON | ['virements-programmes'] | Page virements programmes | "Virement programme cree" | Non | Unit: calcul prochaine date, Integ: creation DB | Frequence invalide, source/dest invalide | P1 |
| E20 | Stats Transferts | Chargement auto | `GET /api/comptes/transferts-programmes/stats` | SQL aggregation | virementsProgrammes, comptes (lecture) | - | - | permission VIEW.COMPTE, agence | - | NON | NON | - | ['virements-programmes-stats'] | KPI cards | "Transferts programmes" | Non | Unit: calcul volume pondere | Aucun transfert actif | P2 |
| E21 | Lister Transferts | Navigation page | `GET /api/comptes/transferts-programmes` | SQL query | virementsProgrammes, comptes, clients, users (lecture) | - | - | permission VIEW.COMPTE, agence | - | NON | NON | - | ['virements-programmes'] | Table paginee | "Virements Programmes" | Non | Integ: pagination + search | Grand volume | P2 |
| E22 | Modifier Transfert | Formulaire edition | `PATCH /api/comptes/transferts-programmes/:id` | SQL update | virementsProgrammes | virementsProgrammes.montant, .frequence, .actif | ACTIVE/PAUSED | permission EDIT.COMPTE, agence | - | NON | NON | SCHEDULED_TRANSFER_UPDATED(action=modified/paused/resumed) | ['virements-programmes'] | Formulaire edition | "Transfert modifie/pause/repris" | Oui via WS | Integ: transition statut | Modification pendant execution | P2 |
| E23 | Supprimer Transfert | Bouton supprimer | `DELETE /api/comptes/transferts-programmes/:id` | SQL soft delete | virementsProgrammes(deletedAt, actif=false) | virementsProgrammes.deletedAt | DELETED (soft) | permission MANAGE.COMPTE, agence | - | NON | NON | SCHEDULED_TRANSFER_UPDATED(action=deleted) | ['virements-programmes'] | Suppression avec confirmation | "Virement annule" | Oui via WS | Integ: soft delete | Suppression pendant execution | P2 |
| E24 | Executer Maintenant | Bouton "Run Now" | `POST /api/comptes/transferts-programmes/:id/run-now` | processScheduledTransfers, ledger | comptes, mouvementsFinanciers, virementsProgrammes(.prochaineExecution, .processingLock) | comptes.soldeCourant | POSTED (mouvement), SUCCESS (versement) | permission MANAGE.COMPTE, agence, solde suffisant | - | OUI (TRANSFER_OUT + TRANSFER_IN) | OUI sync | SCHEDULED_TRANSFER_EXECUTED | ['virements-programmes'], compteKeys | Bouton action | "Execution forcee" | Oui via WS | Integ: execution+GL, E2E: run now complet | Solde insuffisant, transfert deja en cours (lock) | P1 |
| E25 | Historique Execution | Voir runs | `GET /api/comptes/transferts-programmes/:id/history` | getScheduledTransferHistory | virementsProgrammes (lecture) | - | - | permission VIEW.COMPTE, agence | - | NON | NON | - | ['virements-programmes-history'] | Liste runs | "Historique" | Non | Integ: limit/pagination | Historique vide | P2 |
| E26 | Health Check | Admin only | `GET /api/comptes/transferts-programmes/health` | getScheduledTransfersHealth | virementsProgrammes (lecture) | - | healthy/degraded/critical | permission MANAGE.COMPTE | - | NON | NON | - | - | Admin page (si existe) | "Sante du systeme" | Non | Integ: calcul degradation | Systeme degrade | P2 |

---

## 4. MATRICE GESTION COMPTE (Blocage / Cloture / Agence)

| # | Feature/Ecran | Action utilisateur | Endpoint(s) | Service(s) | Tables impactees | Source de verite | Statuts backend | Regles/guards | Idempotency key | Mouvements | GL posting | Events WS | Query Keys | UI | Traduction FR | Temps reel | Tests requis | Edge cases | Risque |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| E27 | Bloquer Compte | Action admin | `POST /api/comptes/:id/bloquer` | comptesService | comptes(.blocageActif=true, .blocageMotif, .blocageDebut, .blocageFin) | comptes.blocageActif | ACTIVE (statut inchange, blocageActif=true) | permission MANAGE.COMPTE, motif requis | - | NON | NON | ACCOUNT_BLOCKED (domain event) | compteKeys.detail(id) | Badge "Bloque" avec cadenas | "Compte bloque" | Oui via domain event | Unit: motifs valides, Integ: blocage empeche retrait | Bloquer un compte deja bloque, blocage sans date fin | P1 |
| E28 | Debloquer Compte | Action admin | `POST /api/comptes/:id/debloquer` | comptesService | comptes(.blocageActif=false, .blocageMotif=null, .blocageFin=null) | comptes.blocageActif = false | ACTIVE (blocage leve) | permission MANAGE.COMPTE | - | NON | NON | NOTIFICATION(success), ACCOUNT_UNBLOCKED (domain) | compteKeys.detail(id) | Badge "Actif" sans cadenas | "Compte debloque" | Oui via NOTIFICATION + domain | Integ: retrait redevient possible | Debloquer un compte non bloque | P2 |
| E29 | Cloturer Compte | Action admin | `POST /api/comptes/:id/cloturer` | comptesService | comptes(.statut=CLOSED, .closedAt, .closedBy) | comptes.statut = CLOSED | CLOSED | permission MANAGE.COMPTE, soldeCourant = 0, pas de transactions pending | - | NON | NON | ACCOUNT_CLOSED (domain) | compteKeys.all | Badge "Cloture" gris | "Compte cloture" | Oui via domain event | Unit: validation solde=0, Integ: transition statut | Solde non zero (BALANCE_NOT_ZERO), transactions en cours (PENDING_TRANSACTIONS) | P1 - Guards OK |
| E30 | Transfert Agence | Action admin | `POST /api/comptes/:id/transfert-agence` | comptesService.transfererCompteAgence | comptes(.agenceId), compteAgencesHistorique | comptes.agenceId = nouvelleAgenceId | - | permission MANAGE.COMPTE | - | NON | NON | - | compteKeys.detail(id) | (pas de UI dedie visible) | "Compte transfere vers agence" | Non | Integ: historique cree | Meme agence source=dest, agence inexistante | P2 |
| E31 | Historique Agences | Consultation | `GET /api/comptes/:id/historique-agences` | comptesService.getCompteAgenceHistorique | compteAgencesHistorique (lecture) | - | - | auth | - | NON | NON | - | - | (pas de UI dedie visible) | "Historique agences" | Non | Integ: tri chronologique | Aucun transfert | P2 |

---

## 5. MATRICE FRONTEND (Composants Epargne)

| # | Composant | Responsabilite | Hooks/API utilises | Query Keys | WS events ecoutes | Labels FR | Statuts affiches | Filtres | Actions | Problemes identifies |
|---|---|---|---|---|---|---|---|---|---|---|
| F1 | Epargnes.tsx | Page principale, KPI, tabs, table | useState + fetch direct (compteEpargneApi.getAll, .getStats) | Aucun React Query (!) | Aucun (!) | "Gestion des Comptes", "Solde Total", "Flux du jour" | ACTIVE, PENDING_ACTIVATION, SUSPENDED, CLOSED | typeCompte (tabs), statut (dropdown), search (debounce 400ms), page (15/page) | Creer compte, Voir detail, Depot, Retrait | **P0: useState au lieu de React Query, pas de WS** |
| F2 | AccountsList.tsx | Table responsive comptes | Props (pas de hooks propres) | - | - | "Voir Details", "Faire un Depot", "Faire un Retrait", "Encaisser le depot initial" | ACTIVE, PENDING_ACTIVATION, SUSPENDED, CLOSED | - (recoit data filtree) | Navigation detail, Depot, Retrait | OK (composant presentationnel) |
| F3 | AccountRow.tsx | Ligne mobile | Props | - | - | Idem AccountsList | Idem | - | Idem | OK (redondant avec AccountsList pour mobile) |
| F4 | AccountDetailSlideOver.tsx | Detail compte, historique, infos | useState + fetch (compteEpargneApi.getAll, transactionEpargneApi.getByCompte, clientApi.getAllList) | ['session-caisse', 'active'] (1 seul) | Aucun | "Solde Disponible", "Historique", "Infos & Titulaire", "Entrees", "Sorties" | ACTIVE, PENDING_ACTIVATION | - | Export releve, Encaisser (si PENDING) | **P1: fetch manuel, pas de React Query pour transactions** |
| F5 | EpargneAccountForm.tsx | Formulaire creation 3 etapes | useState + fetch (compteEpargneApi.create, .getProduits, .getByClient, clientApi.getAllList, sessionCaisseApi.getActive) | Aucun React Query | Aucun | "Nouveau Compte", "Selection du client", "Configuration", "Type de Compte", "Mode de Paiement" | - | Client search, Type radio, Produit dropdown, Mode paiement radio | Creer compte, Valider cash (billetage) | **P1: fetch manuel, Mobile Money desactive** |
| F6 | EpargneDetailModal.tsx | Modal detail (LEGACY) | Props | - | - | "Detail du Compte", "Transactions Recentes" | ACTIVE, PENDING_ACTIVATION, SUSPENDED | - | Depot, Retrait, Interets | **P2: Legacy, remplacer par SlideOver** |
| F7 | EpargneInterestCalculator.tsx | Calculateur interets | useState, POST /transactions-epargne + PATCH /comptes/:id | Aucun React Query | Aucun | "Calculateur d'Interets", "Crediter les Interets", "Rendement" | - | Periode (Mensuel/Trimestriel/Annuel) | Calculer, Crediter | **P0: 2 appels non atomiques, pas de mouvement ledger** |
| F8 | EpargneSavingsGoals.tsx | Objectifs d'epargne | useState + fetch (objectifEpargneApi) | Aucun React Query | Aucun | "Objectifs d'Epargne", "Nouvel Objectif", "Montant Cible", "Date Cible" | ACHIEVED, IN_PROGRESS, ABANDONED | Statut (implicite) | Creer, Modifier progression, Supprimer | P2: fetch manuel |
| F9 | EpargneTransactionForm.tsx | Formulaire depot/retrait | Props + callbacks, POST /transactions-epargne + PATCH /comptes/:id | Aucun React Query | Aucun | "Encaissement Initial", "Confirmer Depot/Retrait", "Nouveau solde" | PENDING_ACTIVATION (mode activation) | Mode paiement (CASH/MM/CHECK/TRANSFER), Operateur (MTN/Airtel) | Valider transaction | **P1: Transaction form fait PATCH balance cote client au lieu d'utiliser les endpoints depot/retrait** |
| F10 | StatementExportModal.tsx | Export releve PDF | useState, jsPDF | Aucun React Query | Aucun | "Exporter Releve de Compte", "Periode", "Format" | - | Periode (Ce mois, 3 mois, Cette annee, custom) | Telecharger PDF | P2: Excel desactive ("Bientot disponible") |

---

## 6. RECAPITULATIF SOURCE DE VERITE EPARGNE

| Entite | Champ source de verite | Table | Mis a jour par | Broadcast WS |
|--------|------------------------|-------|---------------|--------------|
| Solde compte | `comptes.soldeCourant` | comptes | comptesService (depot/retrait/transfert/capitalisation) dans TX | DASHBOARD_UPDATE, LIVE_ACTIVITY, CAISSE_UPDATE |
| Statut compte | `comptes.statut` | comptes | Routes comptes.ts (creation, activation, cloture) | DASHBOARD_UPDATE |
| Blocage | `comptes.blocageActif` | comptes | Routes comptes.ts (bloquer/debloquer) | NOTIFICATION, ACCOUNT_BLOCKED/UNBLOCKED |
| Interets courus | `comptes.accruedInterest` | comptes | InterestSchedulerService (daily CRON) | Aucun |
| Mouvement financier | `mouvementsFinanciers.reference` | mouvementsFinanciers | ledger service dans TX | MOUVEMENT_CREE (outbox) |
| GL posting | `mouvementsFinanciers.glPostingStatus` | mouvementsFinanciers | accounting-posting-service sync | ACCOUNTING_UPDATE |
| Transfert programme | `virementsProgrammes.actif` | virementsProgrammes | Routes comptes.ts | SCHEDULED_TRANSFER_UPDATED |

---

## 7. LISTE DES GAPS P0/P1/P2

### 7.1 GAPS P0 - CRITIQUES

#### GAP-EP-1: Epargnes.tsx utilise useState + fetch direct (pas de React Query)
- **Probleme**: Le composant principal `Epargnes.tsx` utilise `useState` + `fetch` direct (via `loadComptes()` et `loadStats()`) au lieu de React Query. Pas de cache, pas de stale-while-revalidate, pas d'invalidation automatique.
- **Impact**: Les donnees sont rechargees a chaque navigation, pas de temps reel, UX degradee.
- **Fichiers**: [Epargnes.tsx](client/src/components/finance/epargne/Epargnes.tsx)
- **Correctif**:
  1. Refactorer en `useQuery(['comptes', 'list', {typeCompte, statut, search, page}], () => compteEpargneApi.getAll({...}))`
  2. Refactorer stats en `useQuery(['comptes-stats'], () => compteEpargneApi.getStats())`
  3. Brancher sur WS invalidation pour DASHBOARD_UPDATE, COMPTE_UPDATE, BALANCE_UPDATED
- **Patch plan**: PR-EPARGNE-FRONT-1

#### GAP-EP-2: EpargneTransactionForm.tsx fait 2 appels non atomiques pour depot/retrait
- **Probleme**: Le formulaire de transaction fait `POST /transactions-epargne` + `PATCH /comptes/:id` en 2 appels separes cote client. Si le 2eme echoue, la transaction est creee mais le solde n'est pas mis a jour.
- **Impact**: Incoherence solde/transaction en cas d'erreur reseau entre les 2 appels. Le backend a des endpoints atomiques (`POST /api/comptes/:id/depot` et `/retrait`) qui font tout dans une TX.
- **Fichiers**: [EpargneTransactionForm.tsx](client/src/components/finance/epargne/EpargneTransactionForm.tsx)
- **Correctif**:
  1. Remplacer les 2 appels par un seul appel a `compteEpargneApi.depot(id, data)` ou `compteEpargneApi.retrait(id, data)` (endpoints backend atomiques existants)
  2. Supprimer le `PATCH /comptes/:id` cote client pour les transactions
  3. Utiliser le retour de l'endpoint comme source de verite
- **Patch plan**: PR-EPARGNE-FRONT-2

#### GAP-EP-3: EpargneInterestCalculator credite les interets SANS mouvement ledger ni GL
- **Probleme**: Le calculateur d'interets fait `POST /transactions-epargne` + `PATCH /comptes/:id` directement - il ne passe PAS par le ledger (`mouvementsFinanciers`) ni par le GL posting. L'argent credite n'est pas trace comptablement.
- **Impact**: Fuite comptable - interets credites sans trace dans le grand livre. Difference entre solde comptable et solde reel.
- **Fichiers**: [EpargneInterestCalculator.tsx](client/src/components/finance/epargne/EpargneInterestCalculator.tsx)
- **Correctif**:
  1. Creer un endpoint backend `POST /api/comptes/:id/crediter-interets` qui fait tout atomiquement via `ledger.executeWithLedger`:
     - Cree mouvement financier (sourceModule=SYSTEME, typePaiement=INTEREST_PAYMENT)
     - Met a jour soldeCourant
     - Poste vers GL (D:interest_expense C:compte_epargne)
     - Reset accruedInterest
  2. Le frontend n'appelle que cet endpoint unique
  3. Supprimer le PATCH /comptes/:id client-side
- **Patch plan**: PR-EPARGNE-BACK-1

#### GAP-EP-4: Aucun WS event ecoute dans les composants Epargne
- **Probleme**: Aucun des 10 composants Epargne n'ecoute les events WebSocket (DASHBOARD_UPDATE, BALANCE_UPDATED, COMPTE_UPDATE, LIVE_ACTIVITY). Toutes les mises a jour sont manuelles.
- **Impact**: Pas de temps reel. Si un autre agent fait un depot/retrait, l'ecran n'est pas mis a jour. Donnees stale.
- **Fichiers**: Tous les composants epargne
- **Correctif**: Brancher sur le WebSocketContext existant et invalider les React Query keys correspondantes (apres GAP-EP-1 resolu)
- **Patch plan**: PR-EPARGNE-FRONT-1 (inclus)

### 7.2 GAPS P1 - IMPORTANTS

#### GAP-EP-5: AccountDetailSlideOver fait fetch manuel pour historique/client
- **Probleme**: Le SlideOver charge les transactions et les infos client via `fetch` direct au lieu de React Query. Pas de cache, rechargement a chaque ouverture.
- **Fichiers**: [AccountDetailSlideOver.tsx](client/src/components/finance/epargne/AccountDetailSlideOver.tsx)
- **Correctif**: Utiliser `useQuery(compteKeys.transactions(compteId), ...)` et `useQuery(clientKeys.detail(clientId), ...)`
- **Patch plan**: PR-EPARGNE-FRONT-3

#### GAP-EP-6: Mobile Money desactive dans EpargneAccountForm
- **Probleme**: Le mode de paiement Mobile Money est marque "Bientot disponible" et desactive dans le formulaire de creation de compte.
- **Impact**: Pas de creation de compte avec depot initial via Mobile Money.
- **Fichiers**: [EpargneAccountForm.tsx](client/src/components/finance/epargne/EpargneAccountForm.tsx)
- **Correctif**: Activer le mode et brancher sur le PaymentIntent existant
- **Patch plan**: PR-EPARGNE-FRONT-4

#### GAP-EP-7: Frequence versement auto ne contient pas BIMENSUEL (2x/mois)
- **Probleme**: Le dropdown de frequence auto-transfer ne propose que WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY. Pas de BIMENSUEL (2 fois par mois, ex: 1er et 15).
- **Impact**: Les clients qui veulent epargner 2x/mois ne peuvent pas configurer correctement.
- **Fichiers**: [EpargneAccountForm.tsx](client/src/components/finance/epargne/EpargneAccountForm.tsx), `shared/enum/enums.ts`
- **Correctif**: Ajouter l'option BIMENSUEL et utiliser le schedule-generator (GAP #1 credit) pour calculer les dates
- **Patch plan**: PR-EPARGNE-FREQ-1

#### GAP-EP-8: Pas de notification pour echec versement auto
- **Probleme**: Quand un versement automatique echoue (solde insuffisant), aucune notification n'est envoyee au client ou a l'agent.
- **Impact**: Le client ne sait pas que son epargne automatique a echoue.
- **Correctif**: Brancher sur le domain event SCHEDULED_TRANSFER_EXECUTED et envoyer un SMS/email si echec
- **Patch plan**: PR-EPARGNE-NOTIF-1

#### GAP-EP-9: Pas d'endpoint unique pour la capitalisation manuelle d'interets
- **Probleme**: Le backend a le CRON de capitalisation automatique mais pas d'endpoint pour crediter manuellement les interets de facon atomique et tracee.
- **Impact**: Le frontend contourne en faisant 2 appels non atomiques (GAP-EP-3).
- **Fichiers**: `server/routes/comptes.ts`
- **Correctif**: Creer `POST /api/comptes/:id/crediter-interets` (voir GAP-EP-3)
- **Patch plan**: PR-EPARGNE-BACK-1

### 7.3 GAPS P2 - AMELIORATIONS

#### GAP-EP-10: EpargneDetailModal.tsx est legacy
- **Probleme**: Composant legacy redondant avec AccountDetailSlideOver. Pas mobile-optimise.
- **Correctif**: Supprimer et utiliser uniquement AccountDetailSlideOver

#### GAP-EP-11: Excel export desactive dans StatementExportModal
- **Probleme**: Export Excel marque "Bientot disponible".
- **Correctif**: Implementer avec xlsx ou exceljs

#### GAP-EP-12: Penalite compte bloque hardcodee a 5%
- **Probleme**: Dans `GET /api/comptes-bloques/:id`, la penalite de retrait anticipe est hardcodee a 5%.
- **Fichiers**: [comptes.ts:1279-1329](server/routes/comptes.ts#L1279-L1329)
- **Correctif**: Rendre configurable par produit/agence

#### GAP-EP-13: Pas de pagination pour GET /api/comptes/:id/transactions
- **Probleme**: Limite par defaut a 50 transactions, pas de pagination cursor.
- **Correctif**: Ajouter cursor pagination

#### GAP-EP-14: EpargneSavingsGoals.tsx utilise fetch direct
- **Probleme**: Le composant objectifs utilise useState+fetch.
- **Correctif**: Refactorer en React Query

---

## 8. PLAN TEMPS REEL EPARGNE

### Events WS et Invalidations

| Event WS | Declencheur Backend | Query Keys a invalider | Strategie |
|----------|---------------------|------------------------|-----------|
| `DASHBOARD_UPDATE` | Depot, Retrait, Activation, Creation | `compteKeys.all`, `compteKeys.lists()`, `['comptes-stats']`, `dashboardKeys.stats()` | Debounce 1s, invalidate |
| `LIVE_ACTIVITY` | Depot, Retrait | `compteKeys.transactions(compteId)`, `compteKeys.detail(compteId)` | Debounce 500ms, invalidate |
| `CAISSE_UPDATE` | Depot, Retrait | `caisseKeys.sessionActive()`, `caisseKeys.operations()` | Debounce 1s, invalidate |
| `COMPTE_UPDATE` | Modification compte (bloquer/debloquer/cloturer) | `compteKeys.detail(compteId)`, `compteKeys.all` | Debounce 1s, invalidate |
| `BALANCE_UPDATED` (entityType=compte) | Tout mouvement affectant un compte | `compteKeys.detail(compteId)`, `compteKeys.all`, `['comptes-stats']` | Debounce 1s, invalidate |
| `SCHEDULED_TRANSFER_UPDATED` | Modif/pause/resume/delete virement programme | `['virements-programmes']`, `['virements-programmes-stats']` | Debounce 1s, invalidate |
| `SCHEDULED_TRANSFER_EXECUTED` | Execution virement programme | `['virements-programmes']`, `compteKeys.all` | Debounce 1s, invalidate |
| `NOTIFICATION` | Retrait (admin), Deblocage | - (notification UI only) | Immediate, toast |

### Payload BALANCE_UPDATED (Epargne)

```typescript
{
  eventId: string;
  entityType: 'compte';
  entityId: string;          // compteId
  newBalance: number;        // nouveau soldeCourant
  previousBalance: number;
  delta: number;
  mouvementRef: string;
  sourceModule: 'EPARGNE' | 'CAISSE' | 'SYSTEME' | 'VERSEMENT_AUTO' | 'COMPTE';
  typePaiement: string;      // DEPOSIT_SAVINGS, WITHDRAWAL_SAVINGS, INTEREST_PAYMENT, etc.
  timestamp: string;
}
```

---

## 9. AUDIT FRONTEND DETAILLE

### Mapping Status FR

| Module | Enum Value | Label FR | Badge Color | Icone |
|--------|------------|----------|-------------|-------|
| Compte | ACTIVE | Actif | emerald | CheckCircle |
| Compte | PENDING_ACTIVATION | En attente | amber | Clock |
| Compte | SUSPENDED | Suspendu | red | AlertTriangle |
| Compte | CLOSED | Cloture | slate | Archive |
| Compte | CANCELLED | Annule | gray | XCircle |
| Type | CURRENT | Courant | blue | - |
| Type | SAVINGS | Epargne | emerald | - |
| Type | BLOCKED | Bloque | gray | Lock |
| Objectif | IN_PROGRESS | En cours | blue | Target |
| Objectif | ACHIEVED | Atteint | green | CheckCircle |
| Objectif | ABANDONED | Abandonne | red | XCircle |
| Plan | ACTIVE | Actif | emerald | - |
| Plan | COMPLETED | Termine | green | - |
| Plan | CANCELLED | Annule | gray | - |
| Versement Auto | SUCCESS | Reussi | green | CheckCircle |
| Versement Auto | FAILED | Echoue | red | XCircle |
| Versement Auto | PENDING | En attente | amber | Clock |
| Blocage Motif | LOAN_GUARANTEE | Garantie pret | - | - |
| Blocage Motif | TONTINE_GUARANTEE | Garantie tontine | - | - |
| Blocage Motif | FORCED_SAVINGS | Epargne forcee | - | - |
| Blocage Motif | INTERNAL_DECISION | Decision interne | - | - |
| Blocage Motif | DISPUTE | Litige | - | - |

### Verification Filtres

| Ecran | Filtre | Branche | Fonctionne |
|-------|--------|---------|------------|
| Epargnes | Type Compte (tabs) | Oui (activeTab -> typeCompte query param) | OK |
| Epargnes | Statut (dropdown) | Oui (statusFilter -> statut query param) | OK |
| Epargnes | Search (debounce) | Oui (400ms debounce -> search query param) | OK |
| Epargnes | Pagination | Oui (page -> query param, 15/page) | OK |
| SlideOver Detail | Aucun filtre transactions | NON (toutes les transactions) | Manque pagination |
| Statement Export | Periode (Ce mois/3mois/Annee/Custom) | Oui (filtre local sur dates) | OK |
| Objectifs | Statut (implicite) | Non (tous affiches) | Manque filtre |
| Virements | Search + Actif/Inactif | Oui (query params) | OK |
| Virements | Pagination | Oui (page, limit max 100) | OK |

---

## 10. PLAN D'IMPLEMENTATION

### Phase 1: Correctifs Critiques (P0)

#### PR-EPARGNE-BACK-1: Endpoint crediter-interets atomique
- **Creer**: `POST /api/comptes/:id/crediter-interets` dans `server/routes/comptes.ts`
- **Implementation**: `ledger.executeWithLedger(sourceModule='SYSTEME', typePaiement='INTEREST_PAYMENT', ...)`
- **Tables**: mouvementsFinanciers (INSERT), comptes (UPDATE soldeCourant, accruedInterest=0), transactionsCompte (INSERT)
- **GL**: Sync posting (D:interest_expense C:compte_epargne)
- **Tests**: Unit (formule interets), Integ (atomicite mouvement+solde), Edge (interets = 0)

#### PR-EPARGNE-FRONT-1: Refactor Epargnes.tsx vers React Query + WS
- **Modifier**: `Epargnes.tsx` - remplacer useState+fetch par useQuery + useMutation
- **Modifier**: `WebSocketContext.tsx` - ajouter handler COMPTE_UPDATE -> invalider compteKeys
- **Ajouter**: Invalidation DASHBOARD_UPDATE -> compteKeys.all, ['comptes-stats']
- **Tests**: Unit (hooks), Integ (invalidation WS), E2E (navigation + real-time)

#### PR-EPARGNE-FRONT-2: Fix TransactionForm - utiliser endpoints atomiques
- **Modifier**: `EpargneTransactionForm.tsx` - remplacer `POST /transactions-epargne + PATCH /comptes` par `compteEpargneApi.depot()` ou `.retrait()`
- **Modifier**: `EpargneInterestCalculator.tsx` - utiliser `POST /api/comptes/:id/crediter-interets`
- **Tests**: Integ (un seul appel), E2E (depot/retrait/interets complets)

### Phase 2: UX + WS (P1)

#### PR-EPARGNE-FRONT-3: SlideOver React Query + WS
- **Modifier**: `AccountDetailSlideOver.tsx` - useQuery pour transactions et client
- **Tests**: Unit (hooks), E2E (detail + refresh temps reel)

#### PR-EPARGNE-FRONT-4: Activer Mobile Money
- **Modifier**: `EpargneAccountForm.tsx` - activer mode MM, brancher PaymentIntent
- **Tests**: E2E (creation compte avec MM)

#### PR-EPARGNE-FREQ-1: Ajouter BIMENSUEL aux versements auto
- **Modifier**: `EpargneAccountForm.tsx` - ajouter option dropdown
- **Modifier**: `server/services/scheduled-transfer-service.ts` - utiliser schedule-generator
- **Tests**: Unit (generation dates bimensuelles), E2E (configuration + execution)

#### PR-EPARGNE-NOTIF-1: Notification echec versement auto
- **Creer**: Handler domain event SCHEDULED_TRANSFER_EXECUTED
- **Brancher**: notification-service avec template VERSEMENT_AUTO_FAILED
- **Tests**: Integ (echec -> notification)

### Phase 3: Polish (P2)

#### PR-EPARGNE-CLEANUP-1: Supprimer legacy + fixes mineurs
- **Supprimer**: `EpargneDetailModal.tsx` (utiliser SlideOver)
- **Modifier**: Penalite 5% -> configurable par produit
- **Ajouter**: Pagination cursor pour transactions
- **Modifier**: `EpargneSavingsGoals.tsx` - React Query
- **Ajouter**: Excel export dans StatementExportModal

---

## RESUME EXECUTIF

### Etat Actuel
- **Backend**: Solide - 29 routes, ledger+GL integre, CRON interets, virements programmes, domain events
- **Frontend**: **Fragile** - 10 composants qui utilisent **tous** useState+fetch au lieu de React Query. Aucun WS ecoute. Transactions non atomiques cote client.
- **Donnees**: Source de verite OK (comptes.soldeCourant), mais risque d'incoherence via les 2 appels non atomiques du frontend.

### Chiffres Cles
- **31 flux Epargne** documentes (E1-E31)
- **10 composants frontend** audites (F1-F10)
- **14 GAPS identifies**: 4 P0, 5 P1, 5 P2
- **3 phases** d'implementation, **8 PRs** planifiees

### Risques Majeurs
1. **GAP-EP-3 (Interets sans ledger)**: Credits d'interets non traces dans le grand livre = fuite comptable. CRITIQUE.
2. **GAP-EP-2 (2 appels non atomiques)**: Depot/Retrait via 2 appels separes = incoherence solde possible. CRITIQUE.
3. **GAP-EP-1 (pas de React Query)**: Toute la page Epargne n'a pas de temps reel, cache, ni invalidation. UX degradee.
4. **GAP-EP-4 (pas de WS)**: Zero temps reel sur la page principale. Operations d'autres agents invisibles.