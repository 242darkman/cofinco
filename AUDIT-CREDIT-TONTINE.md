# AUDIT COMPLET : Modules CREDIT & TONTINE - COFIN&CO-M

**Date**: 2026-01-27
**Auteur**: Staff Engineer / QA Lead / Product Auditor
**Scope**: Backend + Frontend + Temps reel + Rappels EMAIL/SMS

---

## TABLE DES MATIERES

1. [MATRICE CREDIT](#1-matrice-credit)
2. [MATRICE TONTINE](#2-matrice-tontine)
3. [LISTE DES GAPS P0/P1/P2](#3-liste-des-gaps)
4. [PLAN DE TEMPS REEL](#4-plan-de-temps-reel)
5. [SYSTEME DE RAPPELS EMAIL/SMS](#5-systeme-de-rappels-emailsms)
6. [AUDIT FRONTEND](#6-audit-frontend)
7. [PLAN D'IMPLEMENTATION](#7-plan-dimplementation)

---

## 1. MATRICE CREDIT

### 1.1 Flux Complet Credit

| # | Feature/Ecran | Action utilisateur | Endpoint(s) | Service(s) | Tables impactees | Source de verite (champs) | Statuts backend attendus | Regles metiers/guards | Idempotency key | Mouvements crees | GL posting | Events WS emis | Front Query Keys touchees | Affichage UI | Traduction FR | Temps reel | Tests requis | Scenarios edge cases | Risque + Correctifs |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| C1 | Demande Credit | Soumettre formulaire | `POST /api/demandes-credit` | storage.createDemandeCredit | demandesCredit | demandesCredit.statut, .numeroDemande | PENDING_FEES | - Client actif, montant > 0, frequence valide, duree > 0 | numeroDemande (unique) | NON | NON | CREDIT_UPDATE {type: credit_new} | creditKeys.demandes(), demandesCounts | Onglet "A traiter", PipelineFunnel | "Nouvelle demande" | Oui, debounce 1s | Unit: validation champs, Integ: creation en base | Doublon si retry rapide -> numeroDemande unique constraint | P1 - OK |
| C2 | Paiement Frais Engagement | Payer frais dossier | `POST /api/demandes-credit/:id/payer-frais` | storage.createCashTransactionWithLedger | operationsCaisse, mouvementsFinanciers, demandesCredit, factures | demandesCredit.fraisEngagementPayes, mouvementsFinanciers.reference | READY_FOR_INVESTIGATION | - fraisEngagementPayes=false, session caisse active, montant correct | `FRAIS-ENGAGE-{demandeId}` | OUI (ENGAGEMENT_FEE, CREDIT) | OUI sync (rule: ENGAGEMENT_FEE -> D:521 C:702) | BALANCE_UPDATED(session_caisse), CREDIT_UPDATE | creditKeys.all, caisseKeys.operations, demandes | Modal frais, facture/recu | "Frais d'engagement payes" | Oui, BALANCE_UPDATED | Unit: calcul frais, Integ: mouvement+facture, E2E: flux complet | Session fermee pendant paiement, montant incorrect, double paiement | P1 - idempotency OK |
| C3 | Creation Enquete | Remplir formulaire terrain | `POST /api/enquetes-credit` | storage.createEnquete | enquetesCredit, demandesCredit | enquetesCredit.statut, .scoreGlobal | PENDING (enquete), UNDER_INVESTIGATION (demande) | - demande en READY_FOR_INVESTIGATION, agent autorise | - | NON | NON | CREDIT_UPDATE | creditKeys.demandes() | Onglet "Enquetes" | "Enquete creee" | Oui | Unit: validation GPS, Integ: liaison demande | Offline sync conflict, photos upload echoue | P2 - Offline OK via IndexedDB |
| C4 | Validation Enquete | Approuver/Rejeter enquete | `POST /api/enquetes-credit/:id/valider` | storage.updateEnquete | enquetesCredit, demandesCredit | enquetesCredit.statut, demandesCredit.statut | APPROVED/REJECTED/REDUCED (enquete), INVESTIGATION_COMPLETE (demande) | - enquete en PENDING, autorite requise | - | NON | NON | CREDIT_UPDATE | creditKeys.demandes() | Onglet "Enquetes" avec badge | "Enquete validee/rejetee" | Oui | Integ: transition statut | Validation enquete deja validee, score manquant | P2 - guard statut OK |
| C5 | Approbation Credit | Approuver/Rejeter en comite | `POST /api/demandes-credit/:id/approuver` ou `/rejeter` | storage.updateDemande, validateDemandeTransition | demandesCredit | demandesCredit.statut, .montantApprouve | APPROVED/REJECTED/DEFINITIVELY_REJECTED | - statut INVESTIGATION_COMPLETE ou PENDING_APPROVAL, permission credits.approve | - | NON | NON | CREDIT_UPDATE | creditKeys.demandes(), demandesCounts | Onglet "Approbation" | "Credit approuve/rejete" | Oui | Unit: state machine, Integ: transition | Approbation sans enquete, double approbation, montant > demande | P1 - state machine protege |
| C6 | Decaissement Credit | Debourser le montant | `POST /api/credits/decaissement` | ledger.executeWithLedger, accounting-posting | credits, mouvementsFinanciers, ecritures, coffresForts, comptes | credits.statut, .soldeRestant, .disbursementStatus, mouvementsFinanciers | ACTIVE (credit), COMPLETED (disbursement) | - demande APPROVED, coffre solde suffisant (si CASH), permission disbursement | `CREDIT-DISB-{demandeId}` | OUI (CREDIT_DISBURSEMENT, CREDIT/DECAISSEMENT_PROGRAMME) | OUI sync (D:521/531 C:221) | CREDIT_UPDATE(credit_decaissement), BALANCE_UPDATED(coffre/session), ACCOUNTING_UPDATE | creditKeys.all, coffreKeys.stats, caisseKeys | Modal decaissement, detail credit | "Credit decaisse" | Oui, BALANCE_UPDATED | Unit: calcul echeancier, Integ: mouvement+GL, E2E: flux complet | Coffre insuffisant, double decaissement, date programmee future, channel MOBILE_MONEY echoue | **P0** - Idempotency OK, coffre check OK |
| C7 | Remboursement Manuel | Enregistrer paiement | `POST /api/remboursements` | ledger.executeWithLedger, credit-allocation-service, accounting-posting | remboursements, mouvementsFinanciers, credits, ecritures | credits.soldeRestant, remboursements.statut, mouvementsFinanciers | POSTED (remboursement), ACTIVE/PAID (credit) | - credit ACTIVE/LATE, montant > 0, permission remboursements.create | `REMB-{creditId}-{timestamp}` | OUI (CREDIT_REPAYMENT, CREDIT) | OUI sync (D:521 C:701/221) | BALANCE_UPDATED(credit), CREDIT_SOLDE_CHANGE, ACCOUNTING_UPDATE | creditKeys.all, creditKeys.detail, creditKeys.remboursements | Onglet "Remboursements", detail credit | "Remboursement enregistre" | Oui, BALANCE_UPDATED + CREDIT_SOLDE_CHANGE | Unit: allocation penalites->interets->principal, Integ: mouvement+solde, E2E: remboursement partiel/total | Paiement > soldeRestant, paiement sur credit PAID, solde negatif apres allocation | **P0** - allocation service OK |
| C8 | Remboursement Automatique | Prelevement auto programme | Scheduler interne | automatic-repayment-service, ledger, credit-allocation | credits, comptes, mouvementsFinanciers, transactionsCompte | credits.soldeRestant, comptes.soldeCourant, credits.prochaineEcheance | ACTIVE/PAID (credit), POSTED (mouvement) | - remboursementAutomatique=true, solde compte >= echeance, prochaineEcheance <= now | `AUTO-REPAY-{creditId}-{date}` | OUI (CREDIT_REPAYMENT, VERSEMENT_AUTO) | OUI sync | BALANCE_UPDATED(credit+compte), CREDIT_SOLDE_CHANGE | creditKeys.all, compteKeys.epargne | Notification, detail credit (auto) | "Remboursement automatique" | Oui | Unit: calcul echeance, Integ: debit compte+credit, E2E: cycle complet | Solde compte insuffisant, credit deja PAID, double execution meme jour, changement frequence en cours | **P0** - idempotency par date |
| C9 | Echeancier Credit | Consulter echeancier | `GET /api/credits/:id` (avec echeances) | enrichCreditData | credits (lecture seule) | credits.dateDebut, .duree, .echeance, .soldeRestant | - | - credit existe | - | NON | NON | - | creditKeys.detail | Modal detail, onglet "Echeancier" | "Echeancier" | Non (lecture) | Unit: calcul dates echeances | **BI_MONTHLY = 60 jours (FAUX, devrait etre 2x/mois)**, mois courts | **P0** - Voir GAP #1 |
| C10 | Liste Credits | Consulter liste | `GET /api/credits` | storage.getAllCredits, enrichCreditData | credits, clients (join) | credits.statut, .soldeRestant | - | - permission view | - | NON | NON | - | creditKeys.all | Onglet "Credits", filtres statut/client | "Tous les credits" | Oui via CREDIT_UPDATE | Integ: filtres | Pagination manquante sur gros volumes | P2 |
| C11 | Reevaluation | Demander reevaluation | `POST /api/demandes-credit/:id/reevaluation` | storage.updateDemande | demandesCredit | demandesCredit.statut, .nombreReevaluations | REEVALUATION_IN_PROGRESS | - statut REJECTED, nombreReevaluations < max, eligibilite | - | NON | NON | CREDIT_UPDATE | creditKeys.demandes() | Onglet "Reevaluations" | "Reevaluation en cours" | Oui | Unit: eligibilite, Integ: transition | Double reevaluation, max atteint | P2 - guard OK |
| C12 | Remboursement Frais (Refund) | Demander remboursement frais | `POST /api/demandes-credit/:id/initiate-refund` | storage.createCreditRefundRequest | creditRefundRequests | creditRefundRequests.statut, .montantRemboursable | DRAFT -> SUBMITTED | - demande REJECTED, fraisEngagementPayes=true, pas de refund existant | - | NON | NON | CREDIT_UPDATE | ['credit-refunds'] | Page CreditRefundsPage | "Remboursement frais" | Oui | Integ: calcul montant, E2E: flux maker-checker | Double demande, montant > frais payes | P2 |
| C13 | Approbation Refund | Approuver refund (checker) | `POST /api/finance/credit-refunds/:id/approve` | storage.updateCreditRefundRequest | creditRefundRequests | creditRefundRequests.checkerDecision | APPROVED/REJECTED | - statut SUBMITTED, permission checker | - | NON | NON | CREDIT_UPDATE | ['credit-refunds'] | Page refunds, badge | "Refund approuve" | Oui | Integ: checker flow | Checker = Maker (interdit), refund deja approuve | P2 |
| C14 | Paiement Refund | Payer refund approuve | `POST /api/finance/credit-refunds/:id/pay` | ledger.executeWithLedger, accounting-posting | creditRefundRequests, mouvementsFinanciers, ecritures | creditRefundRequests.statut, mouvementsFinanciers | PAID / PENDING_CAISSE | - refund APPROVED, session caisse active (si CASH) | `REFUND-PAY-{refundId}` | OUI (CREDIT_REFUND) | OUI sync | BALANCE_UPDATED, CREDIT_UPDATE | ['credit-refunds'], caisseKeys | Page refunds | "Refund paye" | Oui | Integ: mouvement+GL, E2E: flux complet | Double paiement, montant incorrect | P1 |

### 1.2 Recapitulatif Source de Verite CREDIT

| Entite | Champ source de verite | Table | Mis a jour par | Broadcast WS |
|--------|------------------------|-------|---------------|--------------|
| Solde credit | `credits.soldeRestant` | credits | credit-allocation-service via ledger TX | BALANCE_UPDATED(credit) + CREDIT_SOLDE_CHANGE |
| Statut credit | `credits.statut` | credits | State machine (validateCreditTransition) | CREDIT_UPDATE |
| Statut demande | `demandesCredit.statut` | demandesCredit | State machine (validateDemandeTransition) | CREDIT_UPDATE |
| Prochaine echeance | `credits.prochaineEcheance` | credits | enrichCreditData (calcule) + auto-repay | Aucun direct -> stale possible |
| Mouvement financier | `mouvementsFinanciers.reference` | mouvementsFinanciers | ledger.createMouvementFinancier | MOUVEMENT_CREE |
| GL posting status | `mouvementsFinanciers.glPostingStatus` | mouvementsFinanciers | accounting-posting-service | ACCOUNTING_UPDATE |

---

## 2. MATRICE TONTINE

### 2.1 Flux Complet Tontine

| # | Feature/Ecran | Action utilisateur | Endpoint(s) | Service(s) | Tables impactees | Source de verite | Statuts backend | Regles/guards | Idempotency key | Mouvements | GL posting | Events WS | Query Keys | UI | Traduction FR | Temps reel | Tests requis | Edge cases | Risque | Cycle/Contrib/Distrib | Coherence pot |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| T1 | Creer Tontine | Formulaire creation | `POST /api/tontines` | storage.createTontine | tontines | tontines.statut, .solde | ACTIVE | - permission tontines.create, montantCotisation > 0, nombreMembres >= 2 | - | NON | NON | TONTINE_UPDATE(tontine_new) | tontineKeys.all | Onglet "Tontines" | "Tontine creee" | Oui | Unit: validation, Integ: creation | Doublon nom, date debut passee | P2 | Cycle: aucun | solde = 0 |
| T2 | Ajouter Membre | Selectionner client | `POST /api/tontines/:id/membres` | storage.addMembreTontine | membresTontine, tontines(.membresActuels) | membresTontine.statut, .position | ACTIVE (membre) | - client actif, pas deja membre, membresActuels < nombreMembres | - | NON | NON | TONTINE_UPDATE(membre_added) | tontineKeys.membres, tontineKeys.detail | Onglet "Membres" | "Membre ajoute" | Oui | Integ: position auto | Ajout quand cycle actif, doublon client | P1 - guard OK |
| T3 | Generer Cycle | Bouton "Generer Cycle" | `POST /api/tontines/:id/cycles/generate` | tontine-production-service.generateCycle | tontineCycles, tontineSchedules, tontineTurns, tontineTurnAudit, tontines(.currentCycleId) | tontineCycles.status, tontineTurns.status | OPEN (cycle), SCHEDULED (turns) | - pas de cycle OPEN existant, membres >= min_members_to_start | - | NON | NON | TONTINE_UPDATE(cycle_generated) | tontineKeys.dashboard, tontineKeys.detail | Dashboard, calendrier | "Cycle genere" | Oui | Unit: shuffle Fisher-Yates, Integ: schedules, E2E: cycle complet | Double generation, 0 membres, cycle deja ouvert | **P0** | Cycle: DRAFT->OPEN, turns: SCHEDULED | potCollected=0, potDistributed=0 |
| T4 | Contribution Caisse | Formulaire contribution | `POST /api/contributions-tontine` (ou via dispatch) | tontine-logic.dispatchTontinePayment, ledger.executeWithLedger | contributionsTontine, mouvementsFinanciers, tontines(.solde), membresTontine(.totalCotisations), operationsCaisse, sessionsCaisse | tontines.solde, contributionsTontine.statutTransaction | POSTED (contribution), solde += montant | - membre ACTIVE, montant > 0, session caisse active (CASH), tour valide | `idempotencyKey` (UUID genere) | OUI (Versement Tontine, TONTINE) | OUI sync (D:521 C:tontine_pot) | TONTINE_UPDATE(contribution_new), BALANCE_UPDATED(tontine+session), DASHBOARD_UPDATE | tontineKeys.all, contributions, dashboard, caisseKeys | Onglet "Contributions" | "Contribution enregistree" | Oui, BALANCE_UPDATED | Unit: dispatch priority, Integ: mouvement+solde, E2E: multi-tour | Contribution > montantCotisation, penalites prioritaires, avance tours, session fermee | **P0** | Tour: tourNumero, schedule update | solde += montant, SUM(contrib) doit = solde |
| T5 | Contribution Auto | Prelevement auto (scheduler) | Scheduler interne | automatic-tontine-service.processAutomaticTontineContributions | contributionsTontine, comptes, mouvementsFinanciers, tontines(.solde) | tontines.solde, comptes.soldeCourant | POSTED | - cotisationAutomatique=true, solde compte >= cotisation | `AUTO-TON-{membreId}-{tour}` | OUI (TONTINE) | OUI sync | BALANCE_UPDATED(tontine+compte) | tontineKeys, compteKeys | Dashboard, notification | "Cotisation automatique" | Oui | Integ: debit+credit, E2E: cycle auto | Solde compte insuffisant, tour deja paye, double run | **P0** | Tour courant auto-detecte | solde += montant |
| T6 | Distribution Request | Creer demande distrib | `POST /api/tontines/:id/distribution-requests` | tontine-production-service.createDistributionRequest | tontineDistributionRequests | tontineDistributionRequests.status | DRAFT -> SUBMITTED | - beneficiaire eligible, solde suffisant, cycle OPEN | `idempotencyKey` | NON (pas encore) | NON | TONTINE_UPDATE(distribution_request_created) | tontineKeys.distributions | Onglet "Distributions" | "Demande distribution creee" | Oui | Integ: eligibilite, E2E: workflow | Beneficiaire deja servi, solde insuffisant | P1 | Turn: beneficiaryMemberId | Validation solde avant |
| T7 | Approbation Distribution | Approuver paiement | `POST /api/tontines/:id/distribution-requests/:id/approve` | tontine-production-service.approveDistribution, ledger | tontineDistributionRequests, tontineTurns, tontineCycles, tontines, membresTontine, mouvementsFinanciers, operationsCaisse/comptes | tontines.solde -= net, tontineCycles.potDistributed, tontineTurns.status=PAID_OUT | SUCCESS/PARTIAL (request), PAID_OUT (turn) | - request SUBMITTED, session active (CASH), montant <= solde | `DIST-{requestId}` | OUI (TONTINE_DISTRIBUTION, TONTINE) | OUI sync (D:tontine_pot C:521/512) | TONTINE_UPDATE(distribution_approved), BALANCE_UPDATED(tontine+session/compte), DASHBOARD_UPDATE | tontineKeys.all, dashboard, distributions, caisseKeys | Onglet "Distributions" | "Distribution approuvee" | Oui, BALANCE_UPDATED | Unit: deductions, Integ: mouvement+solde, E2E: payout CASH/MM/WALLET | Double approbation, solde insuffisant entre request et approval, session fermee | **P0** | Turn: PAID_OUT, Cycle: potDistributed += net | solde -= net, potDistributed += net |
| T8 | Annulation Distribution | Annuler request | `POST /api/tontines/:id/distribution-requests/:id/cancel` | storage.cancelTontineDistribution | tontineDistributionRequests, (tontineTurns reset si needed) | tontineDistributionRequests.status | CANCELLED | - request pas encore SUCCESS | - | NON | NON | TONTINE_UPDATE(distribution_cancelled) | tontineKeys.distributions | Onglet "Distributions" | "Distribution annulee" | Oui | Integ: rollback | Annulation apres SUCCESS (interdit) | P2 | - | Pas d'impact solde si pre-approval |
| T9 | Reorder Turns | Reordonner beneficiaires | `POST /api/tontines/:id/cycles/:id/turns/reorder` | tontine-production-service.reorderTurns | tontineTurns, tontineTurnAudit | tontineTurns.beneficiaryMemberId, .turnNumber | SCHEDULED (unchanged) | - cycle OPEN, turns non locked, allow_reorder_turns_until | - | NON | NON | TONTINE_UPDATE(turns_reordered) | tontineKeys.dashboard | Dashboard, calendrier | "Ordre modifie" | Oui | Unit: lock check, Integ: audit trail | Turn locked, cycle ferme, beneficiaire invalide | P2 | - | Pas d'impact pot |
| T10 | Fermer Cycle | Cloturer cycle | `POST /api/tontines/:id/cycles/:id/close` | tontine-production-service | tontineCycles | tontineCycles.status | CLOSED | - tous les turns PAID_OUT ou SKIPPED | - | NON | NON | TONTINE_UPDATE(cycle_closed) | tontineKeys.dashboard | Dashboard | "Cycle cloture" | Oui | Integ: validation | Fermeture avec turns pending | P1 | Cycle: OPEN->CLOSED | potCollected == potDistributed (idealement) |
| T11 | Regles / Penalites | Creer/Modifier regles | `POST/PATCH /api/tontine-regles` | storage.createTontineRegle | tontineRegles | tontineRegles.actif, .montantPenalite | - | - permission tontines.manage | `idempotencyKey` | NON | NON | TONTINE_UPDATE(regle_new/updated) | tontineKeys (reload) | Onglet "Regles" | "Regle creee/modifiee" | Oui | Unit: validation | Regle dupliquee, montant negatif | P2 | - | - |
| T12 | Penalite -> Paye | Marquer penalite payee | `PATCH /api/tontine-penalites/:id` | storage.updateTontinePenalite | tontinePenalites | tontinePenalites.statut | PAID | - statut PENDING | - | NON (gap: devrait creer mouvement) | NON (gap) | TONTINE_UPDATE(penalite_updated) | tontineKeys | Onglet "Regles" | "Penalite payee" | Oui | Integ: statut transition | Double paiement, waive apres PAID | **P0** - Voir GAP #5 | - | Impact pot si penalty_as_revenue |
| T13 | Alertes | Resoudre/Ignorer | `PATCH /api/tontine-alertes/:id` | storage.update | tontineAlertes | tontineAlertes.statut | RESOLVED/IGNORED | - alerte ACTIVE | - | NON | NON | TONTINE_UPDATE | tontineKeys | Onglet "Alertes" | "Alerte resolue" | Oui | Unit: transition | Double resolution | P2 | - | - |
| T14 | Dashboard Tontine | Voir stats/activite | `GET /api/tontines/:id/dashboard` | storage queries | (lecture) | tontines.solde, cycles.potCollected/potDistributed | - | - | - | NON | NON | - | tontineKeys.dashboard | Dashboard tab | - | Non (lecture) | - | Chiffres incoherents si solde != potCollected - potDistributed | P1 - Voir GAP #6 | - | Affichage pot |

### 2.2 Reconciliation Pot Tontine

| Invariant | Formule | Verification | Impact si viole |
|-----------|---------|--------------|-----------------|
| Solde tontine = Contributions - Distributions | `tontines.solde == SUM(contrib POSTED) - SUM(distrib SUCCESS/PARTIAL)` | Query reconciliation | Solde affiche incorrect |
| Pot cycle = Sous-ensemble du pot tontine | `tontineCycles.potCollected >= tontineCycles.potDistributed` | Check on close | Distribution impossible si negatif |
| Membre totalCotisations = SUM contributions | `membresTontine.totalCotisations == SUM(contributionsTontine.montant WHERE membreId AND statut=POSTED)` | Periodic audit | Dashboard membre incorrect |
| Chaque contribution a un mouvement | `contributionsTontine.mouvementId IS NOT NULL` | Constraint check | Trou dans le ledger |
| Chaque distribution SUCCESS a un mouvement | `tontineDistributionRequests.mouvementId IS NOT NULL WHERE status=SUCCESS` | Constraint check | Trou dans le ledger |

---

## 3. LISTE DES GAPS

### 3.1 GAPS P0 - CRITIQUES (Bloquants Production)

#### GAP #1 - BI_MONTHLY = 60 jours (FAUX)
- **Probleme**: `FrequenceRemboursement.BI_MONTHLY` est traite comme 60 jours (= 2 mois) dans `enrichCreditData()` au lieu de "2 fois par mois" (bimensuel).
- **Impact**: Tous les credits bimensuels ont un echeancier faux. Les dates d'echeance, le calcul de retard, et les montants sont incorrects.
- **Fichiers**:
  - `server/storage/finance.ts` lignes 138-147 et 176-185 (`case BI_MONTHLY: frequencyDays = 60`)
  - `shared/enum/enums.ts` (enum `frequenceRemboursementEnum` - le nom BI_MONTHLY est ambigu)
- **Correctif**:
  1. Renommer l'enum BI_MONTHLY en BIMONTHLY ou SEMI_MONTHLY pour clarte (ou ajouter un commentaire fort)
  2. Remplacer `frequencyDays = 60` par une logique calendaire: jours 1 et 15 du mois (configurable)
  3. Creer une fonction `getNextBimensuelDate(fromDate, config)` qui calcule correctement
  4. Adapter `enrichCreditData` pour utiliser un calendrier au lieu d'un nombre fixe de jours
  5. Adapter le scheduler de remboursement auto
- **Patch plan**: PR-CREDIT-1 (voir section 7)

#### GAP #2 - Aucun systeme de rappels/notifications Credit
- **Probleme**: Aucun mecanisme de rappel automatique avant echeance, jour J, ou apres retard pour les credits.
- **Impact**: Les clients ne sont pas prevenus, les retards s'accumulent, perte de revenus.
- **Fichiers a creer**:
  - `server/services/credit-reminder-service.ts`
  - `server/services/reminder-scheduler.ts`
  - `shared/schema/notifications.ts` (templates)
  - Migration: notification_templates seed data
- **Correctif**: Implementer le systeme complet (voir section 5)
- **Patch plan**: PR-NOTIF-1

#### GAP #3 - Aucun systeme de rappels/notifications Tontine
- **Probleme**: Meme que GAP #2 pour les tontines - pas de rappel contribution, pas d'alerte distribution.
- **Impact**: Membres non prevenus, contributions manquees, retards.
- **Fichiers a creer**: `server/services/tontine-reminder-service.ts`
- **Correctif**: Implementer (voir section 5)
- **Patch plan**: PR-NOTIF-2

#### GAP #4 - Paiement penalite tontine sans mouvement ledger
- **Probleme**: `PATCH /api/tontine-penalites/:id` met a jour le statut en PAID mais ne cree PAS de mouvement financier ni de posting GL. L'argent de la penalite n'est pas trace dans le ledger.
- **Impact**: Fuite financiere - argent encaisse non comptabilise, GL desynchronise.
- **Fichiers**:
  - `server/routes/tontine.ts` (endpoint penalite update)
  - `server/storage/tontine.ts` (updateTontinePenalite)
- **Correctif**:
  1. Creer un endpoint `POST /api/tontines/:id/penalites/:id/pay` qui utilise `ledger.executeWithLedger`
  2. Creer un mouvement financier (typePaiement=TONTINE_PENALTY, sourceModule=TONTINE)
  3. Poster vers GL (D:521 C:compte_penalite selon penalty_as_revenue)
  4. Emettre BALANCE_UPDATED + TONTINE_UPDATE
- **Patch plan**: PR-TONTINE-1

#### GAP #5 - `useDemandes` hook utilise useState au lieu de React Query
- **Probleme**: Le hook `useDemandes.ts` utilise `useState` + `fetch` au lieu de React Query comme le reste de l'app. Pas de cache, pas d'invalidation automatique, pas de stale-while-revalidate.
- **Impact**: Donnees potentiellement stale, pas de real-time pour les demandes credit, re-fetch manuels necessaires.
- **Fichiers**: `client/src/hooks/credits/useDemandes.ts`
- **Correctif**: Refactorer en React Query avec `useQuery`/`useMutation`, utiliser `creditKeys.demandes()`, brancher sur WS invalidation.
- **Patch plan**: PR-FRONT-1

### 3.2 GAPS P1 - IMPORTANTS (Impact UX/Data Quality)

#### GAP #6 - Incoherence possible pot tontine vs SUM(contrib/distrib)
- **Probleme**: `tontines.solde` est un champ denormalise mis a jour incrementalement. En cas de crash/retry/race condition, il peut diverger de `SUM(contributions) - SUM(distributions)`.
- **Impact**: Dashboard tontine affiche un solde incorrect.
- **Fichiers**:
  - `server/storage/tontine.ts` (updateSolde)
  - `server/services/ledger.ts` (updateTontineSolde)
- **Correctif**:
  1. Ajouter un endpoint `GET /api/tontines/:id/reconciliation` qui compare solde vs SUM
  2. Ajouter un job periodique de reconciliation (CRON quotidien)
  3. Alerter si ecart > 0
- **Patch plan**: PR-TONTINE-2

#### GAP #7 - prochaineEcheance credit non broadcast via WS
- **Probleme**: Quand `credits.prochaineEcheance` est mise a jour (apres remboursement), aucun event WS specifique n'est emis. Le frontend recalcule via `enrichCreditData` mais peut afficher une ancienne valeur.
- **Impact**: Echeancier potentiellement stale cote client.
- **Fichiers**: `server/services/ledger.ts`, `server/storage/finance.ts`
- **Correctif**: Inclure `prochaineEcheance` dans le payload de BALANCE_UPDATED(credit) ou creer un event SCHEDULE_UPDATED.
- **Patch plan**: PR-RT-1

#### GAP #8 - Pas de pagination pour GET /api/credits
- **Probleme**: `getAllCredits()` retourne tous les credits sans pagination. Sur une agence avec 1000+ credits, c'est un probleme de performance.
- **Fichiers**: `server/storage/finance.ts` (getAllCredits), `server/routes/finance.ts`
- **Correctif**: Ajouter `limit`, `offset`, `cursor` params + adapter le frontend avec infinite scroll ou pagination.
- **Patch plan**: PR-PERF-1

#### GAP #9 - TontineCalendar calcule les dates localement
- **Probleme**: `TontineCalendar.tsx` calcule les dates des tours a partir de la frequence et date de debut, au lieu d'utiliser les `tontineSchedules.dueDate` du backend.
- **Impact**: Dates affichees potentiellement differentes du backend (fuseaux, jours non ouvrables, report weekend).
- **Fichiers**: `client/src/components/finance/tontine/TontineCalendar.tsx`
- **Correctif**: Utiliser l'API `GET /api/tontines/:id/cycles/:id/schedules` pour les dates.
- **Patch plan**: PR-FRONT-2

#### GAP #10 - Mobile Money contributions/distributions desactivees cote front
- **Probleme**: Dans `TontineContributions.tsx`, les modes MOBILE_MONEY, TRANSFER et CHECK sont marques "bientot disponibles" et desactives.
- **Impact**: Pas de contribution MM possible via l'interface tontine.
- **Fichiers**: `client/src/components/finance/tontine/TontineContributions.tsx`
- **Correctif**: Activer les modes et brancher sur le flow PaymentIntent existant.
- **Patch plan**: PR-FRONT-3

### 3.3 GAPS P2 - AMELIORATIONS (UX/Maintenance)

#### GAP #11 - "as any" dans enrichCreditData
- **Probleme**: `enrichCreditData` retourne `any` et utilise `as any` pour les comparaisons de statut (ligne 128).
- **Fichiers**: `server/storage/finance.ts` ligne 106, 128
- **Correctif**: Typer le retour avec une interface `EnrichedCredit`.

#### GAP #12 - Pas de mapping central statuts FR pour credits
- **Probleme**: Les traductions FR des statuts credit sont dispersees dans chaque composant frontend au lieu d'un mapping central.
- **Fichiers**: Multiple composants dans `client/src/components/finance/credits/`
- **Correctif**: Creer un fichier `shared/i18n/credit-status-labels.ts` centralise.

#### GAP #13 - useEnquetes hook utilise useState (comme useDemandes)
- **Probleme**: Meme probleme que GAP #5 pour les enquetes.
- **Fichiers**: `client/src/hooks/credits/useEnquetes.ts`
- **Correctif**: Refactorer en React Query.

#### GAP #14 - Tontine Frequencies ne match pas Credit Frequencies
- **Probleme**: Les tontines utilisent `TontineFrequency` (DAILY, WEEKLY, BIWEEKLY, MONTHLY, BIMONTHLY, QUARTERLY) tandis que les credits utilisent `frequenceRemboursementEnum` (DAILY, WEEKLY, MONTHLY, BI_MONTHLY, QUARTERLY). Pas d'harmonisation.
- **Correctif**: Creer un enum unifie `FrequenceFinanciere` ou harmoniser les noms.

#### GAP #15 - Pas d'export CSV/PDF pour les tontines
- **Probleme**: Les credits ont des exports (echeancier PDF, recus), mais les tontines n'ont pas d'export contributions/distributions.
- **Correctif**: Ajouter endpoint + composant d'export.

---

## 4. PLAN DE TEMPS REEL

### 4.1 Events WebSocket Standards

| Event Type | Declencheur | Payload Minimal OBLIGATOIRE | Emetteur |
|------------|-------------|----------------------------|----------|
| `BALANCE_UPDATED` | Tout mouvement financier | `{eventId, entityType, entityId, newBalance, previousBalance, delta, mouvementRef, sourceModule, typePaiement, timestamp}` | ledger.executeWithLedger (post-commit) |
| `CREDIT_UPDATED` | Creation/modif/suppression credit ou demande | `{type: 'credit_new'|'credit_updated'|'credit_decaissement'|'demande_updated', id, creditId?, demandeId?, statut?}` | Routes finance.ts |
| `TONTINE_UPDATED` | Toute operation tontine | `{type: string, tontineId, id?, cycleId?, status?, amount?}` | Routes tontine.ts |
| `SCHEDULE_UPDATED` | Changement echeancier/planning | `{entityType: 'credit'|'tontine', entityId, nextDueDate, scheduleVersion, reason}` | Services apres recalcul |
| `ACCOUNTING_UPDATE` | Posting GL reussi | `{type: 'gl_entry_posted', ecritureId, numeroPiece, sourceModule}` | accounting-posting-service |
| `NOTIFICATION_SENT` | Rappel envoye | `{channel: 'SMS'|'EMAIL', templateCode, recipientId, status}` | notification-worker |

### 4.2 Payload Minimal OBLIGATOIRE (toutes entites financieres)

```typescript
interface BalanceUpdatePayload {
  eventId: string;          // UUID v4 pour idempotence
  entityType: 'compte' | 'credit' | 'tontine' | 'session_caisse' | 'coffre';
  entityId: string;         // UUID de l'entite
  newBalance: number;       // Nouveau solde
  previousBalance: number;  // Ancien solde
  delta: number;            // Variation (+ ou -)
  mouvementRef: string;     // Reference mouvement financier
  sourceModule: string;     // Module source (CREDIT, TONTINE, etc.)
  typePaiement?: string;    // Type operation
  timestamp: string;        // ISO 8601
}

interface ScheduleUpdatePayload {
  entityType: 'credit' | 'tontine';
  entityId: string;
  nextDueDate: string;      // ISO 8601
  scheduleVersion: number;  // Version incrementale
  reason: string;           // 'repayment' | 'recompute' | 'frequency_change'
}
```

### 4.3 Invalidations React Query par Event

| Event WS | Query Keys a invalider | Strategie |
|----------|------------------------|-----------|
| `BALANCE_UPDATED` (credit) | `balanceKeys.credit(id)`, `creditKeys.all`, `creditKeys.detail(id)`, `dashboardKeys.stats()` | Debounce 1s, invalidate |
| `BALANCE_UPDATED` (tontine) | `balanceKeys.tontine(id)`, `tontineKeys.all`, `tontineKeys.detail(id)`, `tontineKeys.dashboard(id)` | Debounce 1s, invalidate |
| `BALANCE_UPDATED` (session) | `caisseKeys.sessions()`, `caisseKeys.sessionActive()`, `dashboardKeys.stats()` | Debounce 1s, invalidate |
| `CREDIT_UPDATED` | `creditKeys.all`, `creditKeys.demandes()`, `creditKeys.demandesCounts()` | Debounce 1s, invalidate |
| `TONTINE_UPDATED` | `tontineKeys.all`, `tontineKeys.detail(id)`, `tontineKeys.contributions(id)`, `tontineKeys.distributions(id)`, `tontineKeys.dashboard(id)` | Debounce 1s, invalidate |
| `SCHEDULE_UPDATED` | `creditKeys.echeancier(id)` ou `tontineKeys.dashboard(id)` | Debounce 1s, invalidate |
| `ACCOUNTING_UPDATE` | `comptabiliteKeys.all` | Debounce 2s, invalidate |

### 4.4 Strategie Anti-Race Conditions

| Mecanisme | Implementation | Fichiers |
|-----------|----------------|----------|
| **Debounce** | 1000ms par defaut sur toutes les invalidations WS (deja en place) | WebSocketContext.tsx |
| **Idempotence WS** | Set `processedEventIds` (max 1000 entries), skip si eventId deja vu | WebSocketContext.tsx (deja en place) |
| **updatedAt optimistic** | Chaque entite a un `updatedAt`. Le frontend envoie le dernier `updatedAt` connu; le backend refuse si conflict (409). | A implementer sur les mutations critiques |
| **Pessimistic locking** | `SELECT ... FOR UPDATE` dans les transactions ledger (deja en place) | ledger.ts |
| **Versioning schedule** | Ajouter `scheduleVersion: integer` sur credits et tontines. Incrementer a chaque recalcul. Le frontend compare avant d'afficher. | A ajouter |
| **Optimistic update** | Pour les operations utilisateur (contribution, remboursement), mettre a jour le cache React Query immediatement, puis reconcilier avec la reponse serveur. | A implementer dans les hooks de mutation |

### 4.5 Latence Cible

| Operation | Latence cible | Strategie |
|-----------|---------------|-----------|
| Remboursement credit -> UI update | < 500ms | Optimistic update + BALANCE_UPDATED WS |
| Contribution tontine -> dashboard | < 500ms | Optimistic update + BALANCE_UPDATED WS |
| Decaissement credit -> liste credits | < 1s | WS invalidation debounce 1s |
| Distribution tontine -> solde pot | < 500ms | Optimistic update + BALANCE_UPDATED WS |
| GL posting -> comptabilite | < 2s | Synchrone dans TX + ACCOUNTING_UPDATE WS |

---

## 5. SYSTEME DE RAPPELS EMAIL/SMS

### 5.1 Cas d'Usage

#### Credit
| Code | Cas | Timing | Canal | Priorite |
|------|-----|--------|-------|----------|
| `CREDIT_REMINDER_BEFORE` | Rappel avant echeance | J-3 (configurable) | SMS + Email | NORMAL |
| `CREDIT_REMINDER_DAY` | Rappel jour J | J (matin 8h) | SMS | HIGH |
| `CREDIT_LATE_D1` | Retard J+1 | J+1 | SMS | HIGH |
| `CREDIT_LATE_D7` | Retard J+7 | J+7 | SMS + Email | URGENT |
| `CREDIT_LATE_D15` | Retard J+15 | J+15 | SMS + Email + In-App | URGENT |
| `CREDIT_LATE_D30` | Retard J+30 (mise en demeure) | J+30 | SMS + Email | URGENT |
| `CREDIT_PAYMENT_CONFIRM` | Confirmation paiement | Apres remboursement | SMS | NORMAL |
| `CREDIT_PENALTY_APPLIED` | Notification penalite | Apres application | SMS | HIGH |
| `CREDIT_FULLY_PAID` | Credit solde | Apres dernier paiement | SMS + Email | NORMAL |

#### Tontine
| Code | Cas | Timing | Canal | Priorite |
|------|-----|--------|-------|----------|
| `TONTINE_CONTRIB_REMINDER` | Rappel contribution | J-2 avant dueDate du schedule | SMS | NORMAL |
| `TONTINE_CONTRIB_DAY` | Jour de cotisation | J (matin 8h) | SMS | HIGH |
| `TONTINE_CONTRIB_LATE` | Retard cotisation | J+1 | SMS | HIGH |
| `TONTINE_CONTRIB_CONFIRM` | Confirmation contribution | Apres paiement | SMS | NORMAL |
| `TONTINE_DISTRIB_NOTIFY` | Notification distribution | Quand beneficiaire selectionne | SMS + Email | HIGH |
| `TONTINE_DISTRIB_PAID` | Distribution payee | Apres paiement | SMS | NORMAL |
| `TONTINE_PENALTY_APPLIED` | Penalite appliquee | Apres application | SMS | HIGH |
| `TONTINE_CYCLE_START` | Debut de cycle | Au demarrage | SMS + Email | NORMAL |
| `TONTINE_CYCLE_END` | Fin de cycle | A la cloture | SMS + Email | NORMAL |
| `TONTINE_MEMBER_WELCOME` | Bienvenue nouveau membre | A l'ajout | SMS | NORMAL |

### 5.2 Generation de Schedule - Algorithme

```typescript
// ===================================================================
// server/services/schedule-generator.ts
// ===================================================================

export interface ScheduleConfig {
  frequency: FrequenceFinanciere;
  startDate: Date;
  endDate?: Date;        // Optionnel (calcule si duree fournie)
  occurrences?: number;  // Nombre d'echeances (si pas de endDate)

  // Options bimensuel
  bimensuelJours?: [number, number]; // Par defaut [1, 15]

  // Options report
  skipWeekends?: boolean;    // Reporter au prochain jour ouvrable
  skipHolidays?: boolean;    // Reporter si jour ferie
  holidays?: Date[];         // Liste des jours feries

  // Timezone
  timezone?: string;         // Par defaut 'Africa/Douala'
}

export interface ScheduleOccurrence {
  index: number;          // 0-based
  originalDate: Date;     // Date calculee brute
  adjustedDate: Date;     // Date apres report weekend/ferie
  wasAdjusted: boolean;   // true si reportee
  adjustmentReason?: string;
}

/**
 * Genere toutes les dates d'echeance pour une plage donnee.
 *
 * Gere:
 * - Journalier: chaque jour (skip weekends optionnel)
 * - Hebdomadaire: chaque 7 jours
 * - Bimensuel: 2 fois par mois (par defaut 1er et 15)
 * - Mensuel: meme jour chaque mois (gestion mois courts)
 * - Trimestriel: chaque 3 mois
 */
export function generateSchedule(config: ScheduleConfig): ScheduleOccurrence[] {
  const {
    frequency,
    startDate,
    endDate,
    occurrences,
    bimensuelJours = [1, 15],
    skipWeekends = false,
    skipHolidays = false,
    holidays = [],
    timezone = 'Africa/Douala'
  } = config;

  const results: ScheduleOccurrence[] = [];
  const maxOccurrences = occurrences || 365; // Safety limit
  let current = new Date(startDate);
  let index = 0;

  while (index < maxOccurrences) {
    let nextDate: Date;

    switch (frequency) {
      case 'DAILY':
        nextDate = addDays(current, index === 0 ? 0 : 1);
        break;

      case 'WEEKLY':
        nextDate = addDays(current, index === 0 ? 0 : 7);
        break;

      case 'BIMENSUEL': // 2 FOIS PAR MOIS
        nextDate = getNextBimensuelDate(startDate, index, bimensuelJours);
        break;

      case 'MONTHLY':
        nextDate = addMonthsSafe(startDate, index);
        break;

      case 'QUARTERLY':
        nextDate = addMonthsSafe(startDate, index * 3);
        break;

      default:
        throw new Error(`Frequence non supportee: ${frequency}`);
    }

    // Verifier si on depasse la date de fin
    if (endDate && nextDate > endDate) break;

    // Ajuster pour weekends/feries
    const adjusted = adjustForNonWorkingDays(nextDate, skipWeekends, skipHolidays, holidays);

    results.push({
      index,
      originalDate: nextDate,
      adjustedDate: adjusted.date,
      wasAdjusted: adjusted.wasAdjusted,
      adjustmentReason: adjusted.reason
    });

    current = nextDate;
    index++;
  }

  return results;
}

/**
 * Calcul bimensuel: 2 dates par mois.
 * Par defaut: 1er et 15 de chaque mois.
 * Si jour > dernier jour du mois => dernier jour du mois.
 */
function getNextBimensuelDate(
  startDate: Date,
  occurrenceIndex: number,
  jours: [number, number]
): Date {
  const [jour1, jour2] = jours.sort((a, b) => a - b);

  // Calculer le mois cible
  const monthOffset = Math.floor(occurrenceIndex / 2);
  const isSecondOfMonth = occurrenceIndex % 2 === 1;

  const targetMonth = new Date(startDate);
  targetMonth.setMonth(targetMonth.getMonth() + monthOffset);

  const targetDay = isSecondOfMonth ? jour2 : jour1;
  const lastDayOfMonth = getLastDayOfMonth(
    targetMonth.getFullYear(),
    targetMonth.getMonth()
  );

  // Si jour depasse fin de mois => dernier jour du mois
  const actualDay = Math.min(targetDay, lastDayOfMonth);

  return new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth(),
    actualDay
  );
}

/**
 * Ajoute N mois en gerant les mois courts.
 * Ex: 31 janvier + 1 mois = 28/29 fevrier (dernier jour)
 */
function addMonthsSafe(startDate: Date, months: number): Date {
  const result = new Date(startDate);
  const targetMonth = result.getMonth() + months;
  result.setMonth(targetMonth);

  // Si le jour a change (ex: 31 -> 3 mars), revenir au dernier jour
  if (result.getDate() !== startDate.getDate()) {
    result.setDate(0); // Dernier jour du mois precedent
  }

  return result;
}

/**
 * Ajuste une date pour eviter weekends et jours feries.
 * Strategie: avancer au prochain jour ouvrable.
 */
function adjustForNonWorkingDays(
  date: Date,
  skipWeekends: boolean,
  skipHolidays: boolean,
  holidays: Date[]
): { date: Date; wasAdjusted: boolean; reason?: string } {
  let adjusted = new Date(date);
  let wasAdjusted = false;
  let reason: string | undefined;

  const maxIterations = 10; // Safety
  let i = 0;

  while (i < maxIterations) {
    const dayOfWeek = adjusted.getDay();

    if (skipWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      // Dimanche (0) -> Lundi (+1), Samedi (6) -> Lundi (+2)
      adjusted.setDate(adjusted.getDate() + (dayOfWeek === 0 ? 1 : 2));
      wasAdjusted = true;
      reason = 'weekend_report';
      i++;
      continue;
    }

    if (skipHolidays && isHoliday(adjusted, holidays)) {
      adjusted.setDate(adjusted.getDate() + 1);
      wasAdjusted = true;
      reason = 'ferie_report';
      i++;
      continue;
    }

    break; // Jour ouvrable trouve
  }

  return { date: adjusted, wasAdjusted, reason };
}

function isHoliday(date: Date, holidays: Date[]): boolean {
  return holidays.some(h =>
    h.getFullYear() === date.getFullYear() &&
    h.getMonth() === date.getMonth() &&
    h.getDate() === date.getDate()
  );
}

function getLastDayOfMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
```

### 5.3 Architecture d'Envoi

#### Tables

```typescript
// shared/schema/notifications.ts (EXISTANT - a etendre)

// notification_templates - Templates SMS/Email
// DEJA EXISTANT dans le schema, a seeder avec les templates credit/tontine

// notification_jobs - File d'attente (EXISTANT)
// DEJA EXISTANT: notificationJobs table avec status, channel, etc.

// notification_schedule - NOUVEAU: planification des rappels
export const notificationSchedules = pgTable('notification_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  agenceId: uuid('agence_id').notNull(),

  // Entite liee
  entityType: text('entity_type').notNull(),    // 'credit' | 'tontine'
  entityId: uuid('entity_id').notNull(),

  // Schedule
  templateCode: text('template_code').notNull(), // ex: CREDIT_REMINDER_BEFORE
  scheduledFor: timestamp('scheduled_for').notNull(),

  // Contexte
  recipientClientId: uuid('recipient_client_id'),
  recipientPhone: text('recipient_phone'),
  recipientEmail: text('recipient_email'),
  payload: jsonb('payload'),                     // Donnees template

  // Statut
  status: text('status').default('PENDING'),     // PENDING | SENT | CANCELLED | FAILED
  sentAt: timestamp('sent_at'),
  cancelledAt: timestamp('cancelled_at'),
  cancelReason: text('cancel_reason'),

  // Idempotence
  idempotencyKey: text('idempotency_key').unique(),

  // Meta
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Indexes
// idx_notification_schedules_pending: (status, scheduledFor) WHERE status = 'PENDING'
// idx_notification_schedules_entity: (entityType, entityId)
// uq_notification_schedules_idempotency: (idempotencyKey)
```

#### Providers

```typescript
// server/services/notifications/providers/sms-provider.ts (EXISTANT)
export interface SmsProvider {
  send(to: string, message: string): Promise<SmsResult>;
  getDeliveryStatus(messageId: string): Promise<DeliveryStatus>;
}

// server/services/notifications/providers/mtn-sms-provider.ts (A IMPLEMENTER)
export class MtnSmsProvider implements SmsProvider {
  constructor(private config: MtnConfig) {}

  async send(to: string, message: string): Promise<SmsResult> {
    // Appel API MTN SMS Interface
    // - Authentification OAuth2
    // - Endpoint: POST /sms/v1/send
    // - Rate limit: 100 SMS/min (configurable)
    // - Retry: 3 tentatives avec backoff exponentiel
  }
}

// server/services/notifications/providers/email-provider.ts
export interface EmailProvider {
  send(to: string, subject: string, html: string): Promise<EmailResult>;
}

// Implementations: SendgridEmailProvider, SmtpEmailProvider
```

#### Strategies

| Aspect | Implementation |
|--------|----------------|
| **Retry** | Max 3 tentatives, backoff exponentiel (30s, 120s, 480s) |
| **Idempotency** | `idempotencyKey = {templateCode}-{entityId}-{scheduledFor.toISODate()}` |
| **Rate limiting** | 100 SMS/min, 50 emails/min (configurable par provider) |
| **Audit log** | Chaque envoi logge dans `notification_logs` (existant) |
| **PII masquage** | Telephone masque dans les logs: `+237*****45` |
| **Opt-out** | Champ `smsOptOut` / `emailOptOut` sur client (a ajouter) |
| **Consentement** | Verifier `client.smsConsent` avant envoi (a ajouter) |

### 5.4 Triggers

#### A la creation d'un credit (apres decaissement)

```typescript
// server/services/credit-reminder-service.ts

export async function planCreditReminders(
  creditId: string,
  agenceId: string
): Promise<void> {
  const credit = await getCredit(creditId);
  if (!credit || !credit.dateDebut) return;

  const client = await getClient(credit.clientId);
  if (!client) return;

  // Generer toutes les echeances
  const schedule = generateSchedule({
    frequency: credit.echeance as FrequenceFinanciere,
    startDate: new Date(credit.dateDebut),
    occurrences: credit.duree,
    bimensuelJours: [1, 15], // Configurable par produit
    skipWeekends: true,
    timezone: 'Africa/Douala'
  });

  const reminders: InsertNotificationSchedule[] = [];

  for (const occurrence of schedule) {
    const dueDate = occurrence.adjustedDate;

    // J-3: Rappel avant echeance
    reminders.push({
      agenceId,
      entityType: 'credit',
      entityId: creditId,
      templateCode: 'CREDIT_REMINDER_BEFORE',
      scheduledFor: addDays(dueDate, -3),
      recipientClientId: client.id,
      recipientPhone: client.telephone,
      recipientEmail: client.email,
      payload: {
        clientNom: `${client.prenom} ${client.nom}`,
        montantEcheance: credit.montantEcheance,
        dateEcheance: dueDate.toISOString(),
        numeroPret: credit.numeroCredit,
      },
      idempotencyKey: `CREDIT_REMINDER_BEFORE-${creditId}-${dueDate.toISOString().slice(0,10)}`,
    });

    // J: Rappel jour J
    reminders.push({
      agenceId,
      entityType: 'credit',
      entityId: creditId,
      templateCode: 'CREDIT_REMINDER_DAY',
      scheduledFor: setHour(dueDate, 8), // 8h du matin
      recipientClientId: client.id,
      recipientPhone: client.telephone,
      payload: {
        clientNom: `${client.prenom} ${client.nom}`,
        montantEcheance: credit.montantEcheance,
        dateEcheance: dueDate.toISOString(),
        numeroPret: credit.numeroCredit,
      },
      idempotencyKey: `CREDIT_REMINDER_DAY-${creditId}-${dueDate.toISOString().slice(0,10)}`,
    });

    // J+1: Retard
    reminders.push({
      agenceId,
      entityType: 'credit',
      entityId: creditId,
      templateCode: 'CREDIT_LATE_D1',
      scheduledFor: addDays(dueDate, 1),
      recipientClientId: client.id,
      recipientPhone: client.telephone,
      payload: {
        clientNom: `${client.prenom} ${client.nom}`,
        montantEcheance: credit.montantEcheance,
        numeroPret: credit.numeroCredit,
      },
      idempotencyKey: `CREDIT_LATE_D1-${creditId}-${dueDate.toISOString().slice(0,10)}`,
    });

    // J+7: Retard 2eme relance
    reminders.push({
      agenceId,
      entityType: 'credit',
      entityId: creditId,
      templateCode: 'CREDIT_LATE_D7',
      scheduledFor: addDays(dueDate, 7),
      recipientClientId: client.id,
      recipientPhone: client.telephone,
      recipientEmail: client.email,
      payload: {
        clientNom: `${client.prenom} ${client.nom}`,
        montantEcheance: credit.montantEcheance,
        joursRetard: 7,
        numeroPret: credit.numeroCredit,
      },
      idempotencyKey: `CREDIT_LATE_D7-${creditId}-${dueDate.toISOString().slice(0,10)}`,
    });
  }

  // Inserer en batch
  await db.insert(notificationSchedules).values(reminders)
    .onConflictDoNothing({ target: notificationSchedules.idempotencyKey });
}
```

#### A chaque paiement credit

```typescript
export async function onCreditPayment(
  creditId: string,
  montantPaye: number,
  agenceId: string
): Promise<void> {
  const credit = await getCredit(creditId);
  if (!credit) return;

  // 1. Annuler les rappels de retard pour cette echeance (si paye a temps)
  const now = new Date();
  await db.update(notificationSchedules)
    .set({ status: 'CANCELLED', cancelledAt: now, cancelReason: 'Paiement recu' })
    .where(and(
      eq(notificationSchedules.entityId, creditId),
      eq(notificationSchedules.status, 'PENDING'),
      gte(notificationSchedules.scheduledFor, now),
      inArray(notificationSchedules.templateCode, [
        'CREDIT_LATE_D1', 'CREDIT_LATE_D7', 'CREDIT_LATE_D15', 'CREDIT_LATE_D30'
      ])
    ));

  // 2. Envoyer confirmation de paiement (immediat)
  const client = await getClient(credit.clientId);
  await enqueueNotification({
    channel: 'SMS',
    templateCode: 'CREDIT_PAYMENT_CONFIRM',
    recipient: client.telephone,
    payload: {
      clientNom: `${client.prenom} ${client.nom}`,
      montantPaye: montantPaye.toLocaleString('fr-FR'),
      soldeRestant: credit.soldeRestant,
      numeroPret: credit.numeroCredit,
    },
    agenceId,
    correlationId: `PAYMENT-CONFIRM-${creditId}-${Date.now()}`,
  });

  // 3. Si credit solde, envoyer notification finale
  if (Number(credit.soldeRestant) <= 0) {
    // Annuler TOUS les rappels futurs
    await db.update(notificationSchedules)
      .set({ status: 'CANCELLED', cancelledAt: now, cancelReason: 'Credit solde' })
      .where(and(
        eq(notificationSchedules.entityId, creditId),
        eq(notificationSchedules.status, 'PENDING')
      ));

    await enqueueNotification({
      channel: 'SMS',
      templateCode: 'CREDIT_FULLY_PAID',
      recipient: client.telephone,
      payload: {
        clientNom: `${client.prenom} ${client.nom}`,
        numeroPret: credit.numeroCredit,
      },
      agenceId,
    });
  }

  // 4. Si frequence/duree changee, replanifier
  // (appeler planCreditReminders avec reset)
}
```

#### Pour les tontines (similaire)

```typescript
// server/services/tontine-reminder-service.ts

export async function planTontineReminders(
  tontineId: string,
  cycleId: string,
  agenceId: string
): Promise<void> {
  const tontine = await getTontine(tontineId);
  const membres = await getMembresTontine(tontineId);
  const schedules = await getTontineSchedules(tontineId, cycleId);

  const reminders: InsertNotificationSchedule[] = [];

  for (const schedule of schedules) {
    for (const membre of membres) {
      if (membre.statut !== 'ACTIVE') continue;

      const client = await getClient(membre.clientId);
      if (!client) continue;

      // J-2: Rappel contribution
      reminders.push({
        agenceId,
        entityType: 'tontine',
        entityId: tontineId,
        templateCode: 'TONTINE_CONTRIB_REMINDER',
        scheduledFor: addDays(new Date(schedule.dueDate), -2),
        recipientClientId: client.id,
        recipientPhone: client.telephone,
        payload: {
          clientNom: `${client.prenom} ${client.nom}`,
          tontineNom: tontine.nom,
          montantCotisation: tontine.montantCotisation,
          dateEcheance: schedule.dueDate,
          tourNumero: schedule.periodNumber,
        },
        idempotencyKey: `TONTINE_CONTRIB_REMINDER-${tontineId}-${membre.id}-${schedule.id}`,
      });

      // J: Jour de cotisation
      reminders.push({
        agenceId,
        entityType: 'tontine',
        entityId: tontineId,
        templateCode: 'TONTINE_CONTRIB_DAY',
        scheduledFor: setHour(new Date(schedule.dueDate), 8),
        recipientClientId: client.id,
        recipientPhone: client.telephone,
        payload: {
          clientNom: `${client.prenom} ${client.nom}`,
          tontineNom: tontine.nom,
          montantCotisation: tontine.montantCotisation,
        },
        idempotencyKey: `TONTINE_CONTRIB_DAY-${tontineId}-${membre.id}-${schedule.id}`,
      });
    }
  }

  await db.insert(notificationSchedules).values(reminders)
    .onConflictDoNothing({ target: notificationSchedules.idempotencyKey });
}
```

### 5.5 Worker de Rappels

```typescript
// server/services/notifications/reminder-processor.ts

/**
 * Processeur de rappels planifies.
 * Tourne toutes les 60 secondes.
 * Lit les notification_schedules en PENDING dont scheduledFor <= now.
 * Pour chaque: verifie condition (credit pas deja paye, tontine toujours active),
 * puis enqueue dans notification_jobs.
 */
export async function processScheduledReminders(): Promise<ProcessResult> {
  const now = new Date();

  // 1. Recuperer les rappels a envoyer (lock for update skip locked)
  const pendingReminders = await db
    .select()
    .from(notificationSchedules)
    .where(and(
      eq(notificationSchedules.status, 'PENDING'),
      lte(notificationSchedules.scheduledFor, now)
    ))
    .limit(50)
    .for('update', { skipLocked: true });

  let sent = 0, cancelled = 0, failed = 0;

  for (const reminder of pendingReminders) {
    try {
      // 2. Verifier que le rappel est toujours pertinent
      const shouldSend = await shouldSendReminder(reminder);

      if (!shouldSend) {
        await db.update(notificationSchedules)
          .set({ status: 'CANCELLED', cancelledAt: now, cancelReason: 'Condition non remplie' })
          .where(eq(notificationSchedules.id, reminder.id));
        cancelled++;
        continue;
      }

      // 3. Enqueue dans la file de notification
      await enqueueNotification({
        channel: getChannelForTemplate(reminder.templateCode),
        templateCode: reminder.templateCode,
        recipient: reminder.recipientPhone || reminder.recipientEmail!,
        payload: reminder.payload as Record<string, unknown>,
        agenceId: reminder.agenceId,
        correlationId: reminder.idempotencyKey,
      });

      // 4. Marquer comme envoyee
      await db.update(notificationSchedules)
        .set({ status: 'SENT', sentAt: now })
        .where(eq(notificationSchedules.id, reminder.id));
      sent++;

    } catch (error) {
      await db.update(notificationSchedules)
        .set({ status: 'FAILED' })
        .where(eq(notificationSchedules.id, reminder.id));
      failed++;
    }
  }

  return { sent, cancelled, failed, total: pendingReminders.length };
}

/**
 * Verifie si un rappel doit toujours etre envoye.
 * Ex: ne pas envoyer de rappel de retard si le client a deja paye.
 */
async function shouldSendReminder(reminder: NotificationSchedule): Promise<boolean> {
  if (reminder.entityType === 'credit') {
    const credit = await getCredit(reminder.entityId);
    if (!credit) return false;

    // Ne pas envoyer si credit deja solde
    if (['PAID', 'CLOSED', 'CANCELLED'].includes(credit.statut)) return false;

    // Pour les rappels de retard: verifier que l'echeance n'a pas ete payee
    if (reminder.templateCode.startsWith('CREDIT_LATE_')) {
      const echeanceDate = new Date(reminder.payload?.dateEcheance as string);
      // Verifier si un remboursement couvre cette echeance
      // ... logique metier
    }

    return true;
  }

  if (reminder.entityType === 'tontine') {
    const tontine = await getTontine(reminder.entityId);
    if (!tontine) return false;
    if (!['ACTIVE'].includes(tontine.statut)) return false;

    // Verifier que le membre est toujours actif
    const client = reminder.recipientClientId;
    // ... logique metier

    return true;
  }

  return true;
}
```

### 5.6 Templates SMS (Exemples)

| Code | Contenu SMS |
|------|-------------|
| `CREDIT_REMINDER_BEFORE` | "COFIN&CO: Cher(e) {clientNom}, votre echeance de {montantEcheance} FCFA pour le pret {numeroPret} arrive le {dateEcheance}. Merci de preparer votre paiement." |
| `CREDIT_REMINDER_DAY` | "COFIN&CO: Rappel - Votre echeance de {montantEcheance} FCFA est due aujourd'hui. Pret: {numeroPret}." |
| `CREDIT_LATE_D1` | "COFIN&CO: ATTENTION - Votre echeance de {montantEcheance} FCFA (pret {numeroPret}) n'a pas ete payee. Merci de regulariser rapidement." |
| `CREDIT_LATE_D7` | "COFIN&CO: URGENT - Retard de 7 jours sur votre pret {numeroPret}. Montant du: {montantEcheance} FCFA. Des penalites peuvent s'appliquer." |
| `CREDIT_PAYMENT_CONFIRM` | "COFIN&CO: Paiement de {montantPaye} FCFA recu pour le pret {numeroPret}. Solde restant: {soldeRestant} FCFA. Merci!" |
| `CREDIT_FULLY_PAID` | "COFIN&CO: Felicitations {clientNom}! Votre pret {numeroPret} est entierement rembourse. Merci pour votre confiance." |
| `TONTINE_CONTRIB_REMINDER` | "COFIN&CO: Rappel tontine '{tontineNom}': cotisation de {montantCotisation} FCFA prevue le {dateEcheance} (Tour {tourNumero})." |
| `TONTINE_CONTRIB_CONFIRM` | "COFIN&CO: Cotisation de {montantPaye} FCFA recue pour la tontine '{tontineNom}' (Tour {tourNumero}). Merci!" |
| `TONTINE_DISTRIB_NOTIFY` | "COFIN&CO: Bonne nouvelle! Vous etes le(la) beneficiaire du Tour {tourNumero} de la tontine '{tontineNom}'. Montant: {montantDistribution} FCFA." |

### 5.7 Fichiers a Creer / Modifier

| Fichier | Action | Description |
|---------|--------|-------------|
| `server/services/schedule-generator.ts` | CREER | Algorithme generation schedule (section 5.2) |
| `server/services/credit-reminder-service.ts` | CREER | Planification + gestion rappels credit |
| `server/services/tontine-reminder-service.ts` | CREER | Planification + gestion rappels tontine |
| `server/services/notifications/reminder-processor.ts` | CREER | Worker traitement rappels planifies |
| `shared/schema/notifications.ts` | MODIFIER | Ajouter table `notification_schedules` |
| `shared/enum/enums.ts` | MODIFIER | Ajouter templateCode enum |
| `server/routes/finance.ts` | MODIFIER | Appeler `planCreditReminders` apres decaissement |
| `server/routes/tontine.ts` | MODIFIER | Appeler `planTontineReminders` apres cycle generate |
| `server/services/notifications/notification-service.ts` | MODIFIER | Exporter `enqueueNotification` |
| Migration SQL | CREER | Table notification_schedules + seed templates |

---

## 6. AUDIT FRONTEND

### 6.1 Mapping Central Status -> Label FR

#### Credits

| Enum Value | Label FR | Badge Color | Icone |
|------------|----------|-------------|-------|
| `PENDING` | En attente | amber | Clock |
| `ACTIVE` | Actif | emerald | CheckCircle |
| `LATE` | En retard | red | AlertTriangle |
| `PAID` | Solde | green | CheckCircle2 |
| `CLOSED` | Cloture | slate | Archive |
| `CANCELLED` | Annule | gray | XCircle |
| `WAITING_DISBURSEMENT` | En attente decaissement | blue | Hourglass |

#### Demandes Credit

| Enum Value | Label FR | Badge Color |
|------------|----------|-------------|
| `PENDING_FEES` | Frais en attente | amber |
| `READY_FOR_INVESTIGATION` | Pret pour enquete | blue |
| `UNDER_INVESTIGATION` | En cours d'enquete | cyan |
| `INVESTIGATION_COMPLETE` | Enquete terminee | indigo |
| `PENDING_APPROVAL` | En attente approbation | yellow |
| `APPROVED` | Approuve | emerald |
| `APPROVED_AFTER_REEVALUATION` | Approuve (reevaluation) | violet |
| `REJECTED` | Rejete | red |
| `DISBURSED` | Decaisse | green |
| `CLOSED` | Cloture | slate |
| `CANCELLED` | Annule | gray |
| `DEFINITIVELY_REJECTED` | Definitivement rejete | red |
| `REEVALUATION_IN_PROGRESS` | Reevaluation en cours | purple |

#### Tontines

| Enum Value | Label FR | Badge Color |
|------------|----------|-------------|
| `ACTIVE` | Active | emerald |
| `COMPLETED` | Terminee | green |
| `PAUSED` | En pause | amber |
| `CANCELLED` | Annulee | gray |

#### Contributions Tontine

| Enum Value | Label FR | Badge Color |
|------------|----------|-------------|
| `POSTED` | Validee | green |
| `PENDING` | En attente | amber |
| `PENDING_SETTLEMENT` | Reglement en cours | blue |
| `CANCELLED` | Annulee | gray |
| `REVERSED` | Annulee (extourne) | red |

#### Distributions Tontine

| Enum Value | Label FR | Badge Color |
|------------|----------|-------------|
| `DRAFT` | Brouillon | gray |
| `SUBMITTED` | Soumise | amber |
| `APPROVED` | Approuvee | blue |
| `PENDING_PROVIDER` | En cours (provider) | amber |
| `SUCCESS` | Payee | green |
| `PARTIAL` | Partielle | yellow |
| `FAILED` | Echec | red |
| `CANCELLED` | Annulee | gray |

#### Frequences

| Enum Value | Label FR |
|------------|----------|
| `DAILY` | Journalier |
| `WEEKLY` | Hebdomadaire |
| `BIWEEKLY` | Bi-hebdomadaire (2 sem.) |
| `BIMENSUEL` / `SEMI_MONTHLY` | Bimensuel (2x/mois) |
| `MONTHLY` | Mensuel |
| `QUARTERLY` | Trimestriel |

### 6.2 Problemes Frontend Identifies

| # | Composant | Probleme | Correctif | Priorite |
|---|-----------|----------|-----------|----------|
| F1 | useDemandes.ts | useState au lieu de React Query | Refactorer avec useQuery/useMutation | P0 |
| F2 | useEnquetes.ts | useState au lieu de React Query | Refactorer avec useQuery/useMutation | P2 |
| F3 | enrichCreditData (backend) | Retourne `any`, utilise `as any` | Creer interface `EnrichedCredit` | P2 |
| F4 | TontineCalendar.tsx | Calcul dates local, pas de backend schedules | Utiliser API schedules | P1 |
| F5 | TontineContributions.tsx | MM/Transfer/Check desactives | Activer quand backend ready | P1 |
| F6 | Credits.tsx | Labels statut hardcodes dans chaque composant | Extraire dans fichier central | P2 |
| F7 | CreditEcheancier.tsx | Pas de sticky header sur scroll | Ajouter `sticky top-0` | P2 |
| F8 | TontineDistributions.tsx | Pas de confirmation avant approbation | Ajouter dialog de confirmation | P1 |
| F9 | CreditRemboursement.tsx | Penalite hardcodee 500 FCFA/jour | Rendre configurable par produit | P1 |
| F10 | Multiple | Toast messages en francais OK | - | OK |
| F11 | Multiple | Dates formatees avec locale FR | - | OK |
| F12 | Multiple | Montants formates FCFA | - | OK |

### 6.3 Filtres Verification

| Ecran | Filtre | Branche au hook | Fonctionne |
|-------|--------|-----------------|------------|
| Credits liste | Statut | Oui (creditKeys.list(filters)) | OK |
| Credits liste | Client search | Oui (filtre local) | OK |
| Credits liste | Agence | Oui (X-Agence-Id header) | OK |
| Demandes | Statut (tabs) | Oui (onglets) | OK |
| Echeancier | Statut (Upcoming/Late/Paid) | Oui (filtre local) | OK |
| Echeancier | Periode (Week/Month/All) | Oui (filtre local) | OK |
| Tontines liste | Statut | Oui (queryParam) | OK |
| Contributions tontine | Statut | Oui (filtre local) | OK |
| Contributions tontine | Membre search | Oui (filtre local) | OK |
| Alertes tontine | Statut (tabs) | Oui (Toutes/Actives/Resolues) | OK |
| Refunds | Statut dropdown | Oui (queryParam) | OK |
| Refunds | Client search | Oui (filtre local) | OK |

---

## 7. PLAN D'IMPLEMENTATION

### Phase 1: Fondations Critiques (P0)

#### PR-CREDIT-1: Correction BI_MONTHLY + Schedule Generator
**Fichiers modifies**:
- `server/services/schedule-generator.ts` (CREER)
- `server/storage/finance.ts` (MODIFIER: enrichCreditData, lignes 138-185)
- `shared/enum/enums.ts` (MODIFIER: renommer/documenter BI_MONTHLY)
- `server/services/automatic-repayment-service.ts` (MODIFIER: utiliser schedule generator)

**Tests critiques**:
- Unit: `generateSchedule` avec toutes les frequences
- Unit: `getNextBimensuelDate` avec mois courts (fev), fin de mois (31)
- Unit: `adjustForNonWorkingDays` avec dimanche, jour ferie
- Integ: enrichCreditData retourne les bonnes dates pour BIMENSUEL
- Edge: 31 janvier -> 28 fevrier (mois court)
- Edge: dimanche + report = lundi
- Edge: BIMENSUEL avec jours [15, 30] en fevrier -> [15, 28]

#### PR-FRONT-1: Refactor useDemandes + useCreditCounts
**Fichiers modifies**:
- `client/src/hooks/credits/useDemandes.ts` (REFACTOR complet)
- `client/src/contexts/WebSocketContext.tsx` (MODIFIER: invalidation demandes)
- `client/src/lib/query-keys.ts` (VERIFIER creditKeys.demandes)

**Tests critiques**:
- Unit: hook retourne les bonnes donnees
- Integ: invalidation WS fonctionne
- E2E: creation demande -> apparait immediatement

#### PR-TONTINE-1: Paiement penalite avec mouvement ledger
**Fichiers modifies**:
- `server/routes/tontine.ts` (CREER endpoint POST /api/tontines/:id/penalites/:id/pay)
- `server/storage/tontine.ts` (MODIFIER: payTontinePenaliteWithLedger)
- `server/services/ledger.ts` (VERIFIER typePaiement TONTINE_PENALTY)

**Tests critiques**:
- Integ: mouvement cree, GL poste, WS emis
- Edge: double paiement (idempotence)
- Edge: penalite deja PAID/WAIVED

### Phase 2: Systeme de Notifications (P0)

#### PR-NOTIF-1: Infrastructure Rappels
**Fichiers a creer**:
- `shared/schema/notifications.ts` (MODIFIER: table notification_schedules)
- `server/services/schedule-generator.ts` (SI pas fait en Phase 1)
- `server/services/notifications/reminder-processor.ts`
- Migration SQL

**Tests critiques**:
- Unit: processScheduledReminders pick les bons rappels
- Integ: shouldSendReminder retourne false si credit PAID
- E2E: rappel planifie -> enqueue -> envoi

#### PR-NOTIF-2: Rappels Credit
**Fichiers a creer/modifier**:
- `server/services/credit-reminder-service.ts`
- `server/routes/finance.ts` (MODIFIER: hook apres decaissement)
- Migration: seed templates SMS/Email

**Tests critiques**:
- Integ: decaissement credit -> rappels planifies (count correct)
- Integ: remboursement -> annulation rappels retard
- Edge: credit BIMENSUEL -> 2 rappels/mois

#### PR-NOTIF-3: Rappels Tontine
**Fichiers a creer/modifier**:
- `server/services/tontine-reminder-service.ts`
- `server/routes/tontine.ts` (MODIFIER: hook apres cycle generate)
- Migration: seed templates SMS/Email

**Tests critiques**:
- Integ: generation cycle -> rappels planifies pour tous les membres
- Edge: membre retire -> rappels annules

### Phase 3: Temps Reel + Qualite (P1)

#### PR-RT-1: Event SCHEDULE_UPDATED + payload enrichi
**Fichiers modifies**:
- `server/services/ledger.ts` (MODIFIER: emettre SCHEDULE_UPDATED)
- `client/src/contexts/WebSocketContext.tsx` (MODIFIER: handler SCHEDULE_UPDATED)
- `client/src/lib/query-keys.ts` (MODIFIER: ajout keys echeancier)

#### PR-RT-2: Optimistic Updates pour contributions/remboursements
**Fichiers modifies**:
- `client/src/hooks/credits/useCredits.ts` (MODIFIER: mutation optimistic)
- `client/src/components/finance/tontine/TontineContributions.tsx` (MODIFIER: optimistic)

#### PR-TONTINE-2: Reconciliation pot + job audit
**Fichiers a creer**:
- `server/services/tontine-reconciliation-service.ts`
- `server/routes/tontine.ts` (AJOUTER: GET /api/tontines/:id/reconciliation)

#### PR-FRONT-2: TontineCalendar utilise backend schedules
**Fichiers modifies**:
- `client/src/components/finance/tontine/TontineCalendar.tsx` (REFACTOR)

### Phase 4: Polish + Performance (P2)

#### PR-PERF-1: Pagination credits + tontines
**Fichiers modifies**:
- `server/storage/finance.ts` (MODIFIER: getAllCredits avec pagination)
- `server/routes/finance.ts` (MODIFIER: query params)
- `client/src/hooks/credits/useCredits.ts` (MODIFIER: infinite scroll)

#### PR-FRONT-3: Activation MM tontine + mapping central labels
**Fichiers modifies**:
- `client/src/components/finance/tontine/TontineContributions.tsx` (ACTIVER MM)
- `shared/i18n/status-labels.ts` (CREER: mapping centralise)
- Multiple composants (MODIFIER: utiliser mapping central)

#### PR-CLEANUP-1: Elimination "as any" + types stricts
**Fichiers modifies**:
- `server/storage/finance.ts` (enrichCreditData -> EnrichedCredit)
- `client/src/hooks/credits/useEnquetes.ts` (REFACTOR React Query)
- Multiple fichiers (MODIFIER: typage strict)

---

## RESUME EXECUTIF

### Etat Actuel
- **Credit**: Module fonctionnel avec ledger, GL, WS. Failles: BI_MONTHLY faux, pas de rappels, useDemandes stale.
- **Tontine**: Module riche (cycles, turns, distributions, dispatch). Failles: penalite sans ledger, reconciliation pot manquante.
- **Notifications**: Infrastructure existante (queue, worker, templates) mais AUCUN rappel credit/tontine planifie.

### Chiffres Cles
- **14 flux Credit** documentes (C1-C14)
- **14 flux Tontine** documentes (T1-T14)
- **15 GAPS identifies**: 5 P0, 5 P1, 5 P2
- **19 templates SMS/Email** a creer
- **4 phases** d'implementation, **13 PRs** planifiees

### Risques Majeurs
1. **GAP #1 (BI_MONTHLY)**: Les credits bimensuels ont un echeancier completement faux. Impact immediat sur les clients.
2. **GAP #2-3 (Rappels)**: Aucun client n'est prevenu avant/apres echeance. Perte de revenus garantie.
3. **GAP #4 (Penalite tontine)**: Argent encaisse non trace dans le ledger. Risque comptable et legal.
