# Moteur de Cr\u00e9dit Relationnel Intelligent (CRI)

> Document de conception R&D \u2014 MicroFlex IMF
> Conformit\u00e9 COBAC / SYSCOHADA r\u00e9vis\u00e9 / Zone CEMAC
> Version 1.0

---

## Table des mati\u00e8res

1. [Vision et principes fondateurs](#1-vision-et-principes-fondateurs)
2. [Mod\u00e8le conceptuel](#2-mod\u00e8le-conceptuel)
3. [Indice de Relation Financi\u00e8re (IRF) \u2014 Algorithme](#3-indice-de-relation-financi\u00e8re-irf)
4. [R\u00e8gles d'octroi : automatique vs validation humaine](#4-r\u00e8gles-doctroi)
5. [Mod\u00e8le d'\u00e9v\u00e9nements d\u00e9clencheurs](#5-mod\u00e8le-d\u00e9v\u00e9nements-d\u00e9clencheurs)
6. [Cr\u00e9dit progressif et paliers](#6-cr\u00e9dit-progressif-et-paliers)
7. [Intelligence collective (tontines et groupes)](#7-intelligence-collective)
8. [R\u00e9trogradation et r\u00e9habilitation](#8-r\u00e9trogradation-et-r\u00e9habilitation)
9. [Int\u00e9gration offline](#9-int\u00e9gration-offline)
10. [S\u00e9curit\u00e9 et contr\u00f4le du risque](#10-s\u00e9curit\u00e9-et-contr\u00f4le-du-risque)
11. [Checklist conformit\u00e9 COBAC et auditabilit\u00e9](#11-checklist-conformit\u00e9-cobac)
12. [Sch\u00e9ma de donn\u00e9es propos\u00e9](#12-sch\u00e9ma-de-donn\u00e9es)
13. [Int\u00e9gration avec l'existant](#13-int\u00e9gration-avec-lexistant)

---

## 1. Vision et principes fondateurs

### Philosophie

Le cr\u00e9dit en microfinance CEMAC ne peut pas \u00eatre trait\u00e9 comme un produit bancaire classique.
La majorit\u00e9 des clients n'ont ni fiche de paie, ni historique bancaire formel, ni garanties
immobili\u00e8res. En revanche, ils poss\u00e8dent quelque chose de mesurable : **un comportement
financier observable dans le temps**.

Le Cr\u00e9dit Relationnel Intelligent repose sur un axiome :

> **La confiance se construit par le comportement financier observable,
> individuel et collectif. Elle se quantifie, se trace et s'explique.**

### Principes directeurs

| # | Principe | Impl\u00e9mentation |
|---|----------|-----------------|
| P1 | **Progressivit\u00e9** | Le cr\u00e9dit cro\u00eet avec la relation, pas avec les garanties |
| P2 | **Transparence** | Chaque d\u00e9cision produit un rapport explicable |
| P3 | **R\u00e9versibilit\u00e9** | La confiance se perd plus vite qu'elle ne se gagne |
| P4 | **Solidarit\u00e9 mesur\u00e9e** | Le groupe renforce l'individu (et inversement) |
| P5 | **Prudence COBAC** | Plafonds automatiques, kill-switch, audit trail |
| P6 | **Offline-first** | \u00c9ligibilit\u00e9 minimale calculable sans r\u00e9seau |
| P7 | **Pas de bo\u00eete noire** | Tout facteur est pond\u00e9r\u00e9, seuil\u00e9 et justifiable |

---

## 2. Mod\u00e8le conceptuel

### Architecture \u00e9v\u00e9nementielle

```
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502                     SOURCES D'\u00c9V\u00c9NEMENTS (event-driven)                     \u2502
\u2502                                                                           \u2502
\u2502  D\u00e9p\u00f4ts    Remboursements    Tontines    Mobile Money    Terrain/Offline  \u2502
\u2502    \u2502           \u2502              \u2502            \u2502               \u2502              \u2502
\u2514\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
    \u2502           \u2502              \u2502            \u2502               \u2502
    \u25bc           \u25bc              \u25bc            \u25bc               \u25bc
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502                     COLLECTEUR D'\u00c9V\u00c9NEMENTS IRF                            \u2502
\u2502                                                                           \u2502
\u2502  Normalise, horodate, enrichit chaque \u00e9v\u00e9nement avec le contexte client   \u2502
\u2502  \u00c9crit dans : irfEventLog (journal d'audit immuable)                     \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                                \u2502
                                \u25bc
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502                     MOTEUR DE CALCUL IRF                                   \u2502
\u2502                                                                           \u2502
\u2502  6 axes pond\u00e9r\u00e9s \u2192 Score IRF (0-1000)                                    \u2502
\u2502  + D\u00e9cision explicable (facteurs, seuils, recommandations)                \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
                                \u2502
                \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u253c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
                \u25bc               \u25bc               \u25bc
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510 \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510 \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  PALIERS DE CR\u00c9DIT  \u2502 \u2502  SNAPSHOT IRF  \u2502 \u2502  D\u00c9CISION EXPLICABLE \u2502
\u2502  (montant, dur\u00e9e,  \u2502 \u2502  (historique)   \u2502 \u2502  (audit COBAC)       \u2502
\u2502   taux)            \u2502 \u2502               \u2502 \u2502                     \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518 \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518 \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
```

### Entit\u00e9s du mod\u00e8le

| Entit\u00e9 | R\u00f4le | Relation existante |
|--------|------|-------------------|
| **Client** | Sujet de la relation | `clients` (existe) |
| **IRF Snapshot** | Photo du score \u00e0 un instant T | **Nouveau** : `irfSnapshots` |
| **IRF Event Log** | Journal immuable des \u00e9v\u00e9nements | **Nouveau** : `irfEventLog` |
| **Palier de Cr\u00e9dit** | Droits de cr\u00e9dit associ\u00e9s au niveau IRF | **Nouveau** : `irfCreditTiers` |
| **D\u00e9cision CRI** | D\u00e9cision d'octroi/refus avec justification | **Nouveau** : `irfDecisions` |
| **Config Pond\u00e9ration** | Poids configurables par l'IMF | **Nouveau** : `irfWeightConfig` |
| **Groupe IRF** | Score collectif d'un groupe/tontine | **Nouveau** : `irfGroupScores` |
| **Kill-switch** | Contr\u00f4le central d'arr\u00eat d'urgence | **Nouveau** : `irfKillSwitch` |

---

## 3. Indice de Relation Financi\u00e8re (IRF)

### 3.1 Principes du score

- **\u00c9chelle** : 0 \u00e0 1000 (granularit\u00e9 fine, lisible humainement)
- **6 axes** pond\u00e9r\u00e9s, configurables par l'IMF
- **Temporel** : d\u00e9gradation naturelle (decay) si inactivit\u00e9
- **Asym\u00e9trique** : la confiance se perd 3x plus vite qu'elle ne se gagne

### 3.2 Les 6 axes

| Axe | Code | Poids par d\u00e9faut | Max points | Source de donn\u00e9es |
|-----|------|-------------------|------------|-------------------|
| Historique de remboursement | `REPAYMENT` | 30% | 300 | `credits`, `echeancesCredits`, `remboursements` |
| Comportement d'\u00e9pargne | `SAVINGS` | 20% | 200 | `comptes`, `mouvementsFinanciers` |
| Participation aux tontines | `TONTINE` | 15% | 150 | `membresTontine`, `contributionsTontine`, `tontinePenalites` |
| Anciennet\u00e9 et continuit\u00e9 | `TENURE` | 15% | 150 | `clients.dateAdhesion`, activit\u00e9 continue |
| Capacit\u00e9 financi\u00e8re d\u00e9montr\u00e9e | `CAPACITY` | 15% | 150 | Flux entrants, r\u00e9gularit\u00e9 revenus |
| Discipline terrain | `FIELD` | 5% | 50 | Op\u00e9rations terrain, ponctualit\u00e9 agent |

### 3.3 Algorithme de calcul \u2014 Pseudo-code

```
FONCTION calculerIRF(clientId, config):

  // 1. R\u00e9cup\u00e9rer le snapshot pr\u00e9c\u00e9dent (ou initialiser \u00e0 0)
  snapshotPrecedent = getLastSnapshot(clientId)
  scorePrecedent = snapshotPrecedent?.scoreTotal ?? 0

  // 2. Charger les donn\u00e9es (parall\u00e8le)
  [historique, comptes, tontines, client, flux, terrain] = PARALLEL:
    getHistoriqueRemboursement(clientId, fen\u00eatre=24mois)
    getComptesEtMouvements(clientId, fen\u00eatre=12mois)
    getParticipationsTontine(clientId)
    getProfilClient(clientId)
    getFluxFinanciers(clientId, fen\u00eatre=6mois)
    getActiviteTerrain(clientId, fen\u00eatre=6mois)

  // 3. Calculer chaque axe
  axes = {}

  // ======== AXE 1 : REMBOURSEMENT (max 300) ========
  axes.REPAYMENT = {
    score: 0,
    facteurs: [],
    indicateurs: {}
  }

  SI historique.totalCredits == 0:
    // Nouveau client : score neutre (40% du max)
    axes.REPAYMENT.score = 120
    axes.REPAYMENT.facteurs.push("Premier cr\u00e9dit - pas d'historique")
  SINON:
    // Cr\u00e9dits sold\u00e9s avec succ\u00e8s : +40pts chacun, max 160
    pointsSoldes = MIN(160, historique.creditsSoldes * 40)
    axes.REPAYMENT.score += pointsSoldes

    // Taux de ponctualit\u00e9 (% \u00e9ch\u00e9ances pay\u00e9es \u00e0 temps)
    tauxPonctualite = historique.echeancesATemps / historique.totalEcheances
    SI tauxPonctualite >= 0.95: axes.REPAYMENT.score += 80
    SI tauxPonctualite >= 0.85: axes.REPAYMENT.score += 50
    SI tauxPonctualite >= 0.70: axes.REPAYMENT.score += 20
    SI tauxPonctualite < 0.50: axes.REPAYMENT.score -= 60

    // P\u00e9nalit\u00e9 retards actifs (cr\u00e9dits LATE en cours)
    axes.REPAYMENT.score -= historique.creditsEnRetard * 80

    // Retard moyen (en jours)
    SI historique.joursRetardMoyen > 30: axes.REPAYMENT.score -= 50
    SI historique.joursRetardMoyen > 15: axes.REPAYMENT.score -= 25
    SI historique.joursRetardMoyen <= 3 ET totalCredits > 0: axes.REPAYMENT.score += 30

    // Bonus remboursement anticip\u00e9
    SI historique.creditsSoldesAnticipe > 0:
      axes.REPAYMENT.score += historique.creditsSoldesAnticipe * 20

    // Tendance : am\u00e9lioration ou d\u00e9gradation sur 12 mois
    SI historique.tendancePonctualite == "AMELIORATION":
      axes.REPAYMENT.score += 20
      axes.REPAYMENT.facteurs.push("Tendance positive de remboursement")
    SI historique.tendancePonctualite == "DEGRADATION":
      axes.REPAYMENT.score -= 30
      axes.REPAYMENT.facteurs.push("ALERTE: D\u00e9gradation du comportement de remboursement")

  axes.REPAYMENT.score = CLAMP(0, 300, axes.REPAYMENT.score)

  // ======== AXE 2 : \u00c9PARGNE (max 200) ========
  axes.SAVINGS = {
    score: 0,
    facteurs: [],
    indicateurs: {}
  }

  // Existence de comptes actifs
  SI comptes.actifs.length > 0: axes.SAVINGS.score += 20

  // Volume d'\u00e9pargne (par rapport au cr\u00e9dit demand\u00e9 ou au palier)
  ratioEpargne = comptes.soldeTotal / MAX(1, client.dernierMontantCredit)
  SI ratioEpargne >= 0.50: axes.SAVINGS.score += 60  // \u00c9pargne >= 50% du cr\u00e9dit
  SI ratioEpargne >= 0.25: axes.SAVINGS.score += 40
  SI ratioEpargne >= 0.10: axes.SAVINGS.score += 20

  // R\u00e9gularit\u00e9 des d\u00e9p\u00f4ts (coefficient de variation invers\u00e9)
  // CV = \u00e9cart-type / moyenne des d\u00e9p\u00f4ts mensuels
  regularite = 1 - MIN(1, comptes.cvDepotsmensuels)
  axes.SAVINGS.score += ROUND(regularite * 60)  // Max 60 pts pour r\u00e9gularit\u00e9 parfaite

  // Tendance d'\u00e9pargne (croissance vs d\u00e9croissance)
  SI comptes.tendanceEpargne == "CROISSANCE":
    axes.SAVINGS.score += 40
    axes.SAVINGS.facteurs.push("\u00c9pargne en croissance")
  SI comptes.tendanceEpargne == "DECROISSANCE":
    axes.SAVINGS.score -= 20
    axes.SAVINGS.facteurs.push("ALERTE: \u00c9pargne en baisse")

  // Versements automatiques actifs (discipline programm\u00e9e)
  SI comptes.versementAutoActif:
    axes.SAVINGS.score += 20
    axes.SAVINGS.facteurs.push("Versement automatique actif \u2192 discipline")

  axes.SAVINGS.score = CLAMP(0, 200, axes.SAVINGS.score)

  // ======== AXE 3 : TONTINE (max 150) ========
  axes.TONTINE = {
    score: 0,
    facteurs: [],
    indicateurs: {}
  }

  SI tontines.participationsActives.length == 0:
    // Pas de participation : score neutre (20% du max)
    axes.TONTINE.score = 30
  SINON:
    // Nombre de tontines actives : +20 par tontine, max 60
    axes.TONTINE.score += MIN(60, tontines.participationsActives.length * 20)

    // Assiduit\u00e9 (taux de pr\u00e9sence aux cotisations dues)
    tauxAssiduite = tontines.cotisationsPayees / tontines.cotisationsDues
    axes.TONTINE.score += ROUND(tauxAssiduite * 40)  // Max 40

    // Cycles complets (a re\u00e7u b\u00e9n\u00e9fice = cycle termin\u00e9)
    SI tontines.cyclesComplets > 0:
      axes.TONTINE.score += MIN(30, tontines.cyclesComplets * 15)
      axes.TONTINE.facteurs.push(tontines.cyclesComplets + " cycle(s) complet(s)")

    // P\u00e9nalit\u00e9s (retards, absences)
    axes.TONTINE.score -= tontines.penalites.length * 10
    SI tontines.penalites.length >= 3:
      axes.TONTINE.facteurs.push("ALERTE: " + tontines.penalites.length + " p\u00e9nalit\u00e9s tontine")

    // R\u00f4le dans le groupe (gestionnaire = bonus confiance)
    SI tontines.estGestionnaire:
      axes.TONTINE.score += 20
      axes.TONTINE.facteurs.push("Gestionnaire de tontine \u2192 responsabilit\u00e9")

  axes.TONTINE.score = CLAMP(0, 150, axes.TONTINE.score)

  // ======== AXE 4 : ANCIENNET\u00c9 ET CONTINUIT\u00c9 (max 150) ========
  axes.TENURE = {
    score: 0,
    facteurs: [],
    indicateurs: {}
  }

  ancienneteMois = moisDepuis(client.dateAdhesion)

  // Anciennet\u00e9 brute (paliers)
  SI ancienneteMois >= 60: axes.TENURE.score += 60  // 5+ ans
  SI ancienneteMois >= 36: axes.TENURE.score += 50  // 3+ ans
  SI ancienneteMois >= 24: axes.TENURE.score += 40  // 2+ ans
  SI ancienneteMois >= 12: axes.TENURE.score += 25  // 1+ an
  SI ancienneteMois >= 6:  axes.TENURE.score += 15  // 6+ mois
  SI ancienneteMois < 3:   axes.TENURE.facteurs.push("Nouveau client < 3 mois")

  // Continuit\u00e9 de la relation (pas de gap > 3 mois sans activit\u00e9)
  SI client.plusLongGapInactivite <= 90:
    axes.TENURE.score += 40
    axes.TENURE.facteurs.push("Relation continue sans interruption")
  SINON SI client.plusLongGapInactivite <= 180:
    axes.TENURE.score += 20
  SINON:
    axes.TENURE.score += 0
    axes.TENURE.facteurs.push("ALERTE: P\u00e9riode d'inactivit\u00e9 > 6 mois d\u00e9tect\u00e9e")

  // Profil complet (KYC \u00e0 jour)
  SI client.profilComplet: axes.TENURE.score += 20

  // Segment actuel (h\u00e9ritage)
  SI client.segment == "VIP": axes.TENURE.score += 30
  SI client.segment == "PREMIUM": axes.TENURE.score += 15

  axes.TENURE.score = CLAMP(0, 150, axes.TENURE.score)

  // ======== AXE 5 : CAPACIT\u00c9 FINANCI\u00c8RE D\u00c9MONTR\u00c9E (max 150) ========
  axes.CAPACITY = {
    score: 0,
    facteurs: [],
    indicateurs: {}
  }

  // Flux entrants mensuels moyens (pas le revenu d\u00e9clar\u00e9, le flux OBSERV\u00c9)
  fluxMensuelMoyen = flux.totalEntrant / MAX(1, flux.nombreMois)

  // Stabilit\u00e9 des flux (r\u00e9gularit\u00e9 des entr\u00e9es)
  stabiliteFlux = 1 - MIN(1, flux.cvFluxMensuels)
  axes.CAPACITY.score += ROUND(stabiliteFlux * 50)  // Max 50

  // Volume relatif au cr\u00e9dit demand\u00e9
  SI fluxMensuelMoyen >= 3 * echeanceMensuelleEstimee: axes.CAPACITY.score += 50
  SI fluxMensuelMoyen >= 2 * echeanceMensuelleEstimee: axes.CAPACITY.score += 35
  SI fluxMensuelMoyen >= 1.5 * echeanceMensuelleEstimee: axes.CAPACITY.score += 20
  SI fluxMensuelMoyen < echeanceMensuelleEstimee:
    axes.CAPACITY.score -= 20
    axes.CAPACITY.facteurs.push("ALERTE: Flux insuffisants par rapport \u00e0 l'\u00e9ch\u00e9ance")

  // Diversification des sources (plusieurs types d'entr\u00e9es)
  SI flux.sourcesDistinctes >= 3: axes.CAPACITY.score += 30
  SI flux.sourcesDistinctes >= 2: axes.CAPACITY.score += 15

  // Mobile Money actif (signal de modernit\u00e9 / tra\u00e7abilit\u00e9)
  SI flux.mobileMoneyActif:
    axes.CAPACITY.score += 20
    axes.CAPACITY.facteurs.push("Mobile Money actif \u2192 tra\u00e7abilit\u00e9 renforc\u00e9e")

  axes.CAPACITY.score = CLAMP(0, 150, axes.CAPACITY.score)

  // ======== AXE 6 : DISCIPLINE TERRAIN (max 50) ========
  axes.FIELD = {
    score: 0,
    facteurs: [],
    indicateurs: {}
  }

  // Op\u00e9rations terrain r\u00e9guli\u00e8res
  SI terrain.operationsReussies >= 10: axes.FIELD.score += 20
  SI terrain.operationsReussies >= 5:  axes.FIELD.score += 10

  // Ponctualit\u00e9 aux RDV terrain
  SI terrain.tauxPonctualiteRDV >= 0.9: axes.FIELD.score += 15
  SI terrain.tauxPonctualiteRDV >= 0.7: axes.FIELD.score += 10

  // Synchronisation offline r\u00e9guli\u00e8re (montre engagement)
  SI terrain.syncReguliere: axes.FIELD.score += 15

  axes.FIELD.score = CLAMP(0, 50, axes.FIELD.score)

  // ======== AGGRÉGATION ========
  scoreTotal = axes.REPAYMENT.score
             + axes.SAVINGS.score
             + axes.TONTINE.score
             + axes.TENURE.score
             + axes.CAPACITY.score
             + axes.FIELD.score

  // ======== D\u00c9GRADATION NATURELLE (DECAY) ========
  // Si le client est inactif, le score se d\u00e9grade de 2% par mois d'inactivit\u00e9
  joursDepuisDerniereActivite = joursDepuis(client.derniereActivite)
  SI joursDepuisDerniereActivite > 90:
    moisInactifs = (joursDepuisDerniereActivite - 90) / 30
    decayFactor = MAX(0.5, 1 - (0.02 * moisInactifs))  // Plancher \u00e0 50%
    scoreTotal = ROUND(scoreTotal * decayFactor)

  // ======== LISSAGE (anti-volatilit\u00e9) ========
  // Le score ne peut varier de plus de 15% par recalcul
  SI scorePrecedent > 0:
    variationMax = scorePrecedent * 0.15
    SI scoreTotal > scorePrecedent + variationMax:
      scoreTotal = ROUND(scorePrecedent + variationMax)
    SI scoreTotal < scorePrecedent - variationMax:
      scoreTotal = ROUND(scorePrecedent - variationMax)

  // Exception : en cas de d\u00e9faut de paiement, pas de lissage \u00e0 la baisse
  SI historique.defautActif:
    scoreTotal = MIN(scoreTotal, scorePrecedent - variationMax)

  scoreTotal = CLAMP(0, 1000, scoreTotal)

  // ======== D\u00c9TERMINER LE NIVEAU ========
  niveau = determinerNiveau(scoreTotal)

  // ======== PERSISTER LE SNAPSHOT ========
  snapshot = {
    clientId, scoreTotal, niveau,
    scoreRepayment: axes.REPAYMENT.score,
    scoreSavings: axes.SAVINGS.score,
    scoreTontine: axes.TONTINE.score,
    scoreTenure: axes.TENURE.score,
    scoreCapacity: axes.CAPACITY.score,
    scoreField: axes.FIELD.score,
    facteurs: collecterTousFacteurs(axes),
    configVersion: config.version,
    calculatedAt: NOW()
  }
  INSERT INTO irfSnapshots(snapshot)

  RETOURNER {
    scoreTotal, niveau, axes, snapshot
  }
```

### 3.4 Niveaux IRF et signification

| Niveau | Plage | Libell\u00e9 | Couleur | Signification |
|--------|-------|----------|---------|---------------|
| **N0** | 0\u2013149 | Nouveau / Inconnu | Gris | Pas assez de donn\u00e9es pour \u00e9valuer |
| **N1** | 150\u2013299 | \u00c9mergent | Orange | Relation naissante, cr\u00e9dit minimal possible |
| **N2** | 300\u2013449 | \u00c9tabli | Jaune | Relation en construction, cr\u00e9dit mod\u00e9r\u00e9 |
| **N3** | 450\u2013599 | Confirm\u00e9 | Bleu clair | Relation solide, cr\u00e9dit standard |
| **N4** | 600\u2013749 | Privil\u00e9gi\u00e9 | Bleu | Haute confiance, cr\u00e9dit avantageux |
| **N5** | 750\u2013899 | Excellence | Vert | Relation exceptionnelle, cr\u00e9dit premium |
| **N6** | 900\u20131000 | Ambassadeur | Or | Client mod\u00e8le, conditions maximales |

---

## 4. R\u00e8gles d'octroi

### 4.1 Matrice de d\u00e9cision

```
FONCTION deciderOctroi(clientId, montantDemande, dureeDemande):

  // 0. V\u00e9rifier le kill-switch
  SI killSwitchActif():
    RETOURNER { decision: "BLOQUE", motif: "Arr\u00eat d'urgence activ\u00e9" }

  // 1. Calculer l'IRF
  irf = calculerIRF(clientId, getConfigActive())

  // 2. R\u00e9cup\u00e9rer le palier du client
  palier = getPalierPourNiveau(irf.niveau)

  // 3. V\u00e9rifier l'\u00e9ligibilit\u00e9 de base
  SI irf.niveau == N0:
    RETOURNER {
      decision: "REFUS_DOUX",
      motif: "Historique insuffisant",
      recommandations: [
        "Ouvrir un compte \u00e9pargne et effectuer des d\u00e9p\u00f4ts r\u00e9guliers pendant 3 mois",
        "Rejoindre une tontine pour d\u00e9montrer votre discipline financi\u00e8re",
        "Compl\u00e9ter votre profil KYC"
      ],
      prochainRecalcul: DANS_3_MOIS
    }

  // 4. V\u00e9rifier les plafonds
  SI montantDemande > palier.montantMax:
    RETOURNER {
      decision: "MONTANT_EXCESSIF",
      montantMax: palier.montantMax,
      recommandation: "Demander " + palier.montantMax + " FCFA maximum"
    }

  SI dureeDemande > palier.dureeMax:
    RETOURNER {
      decision: "DUREE_EXCESSIVE",
      dureeMax: palier.dureeMax
    }

  // 5. V\u00e9rifier l'encours total (r\u00e8gle COBAC)
  encoursActuel = getEncoursCreditClient(clientId)
  SI encoursActuel + montantDemande > palier.encoursMax:
    RETOURNER {
      decision: "ENCOURS_DEPASSE",
      encoursActuel, encoursMax: palier.encoursMax,
      montantDisponible: palier.encoursMax - encoursActuel
    }

  // 6. V\u00e9rifier les blocages r\u00e9glementaires
  SI clientEnDefaut(clientId):
    RETOURNER { decision: "REJET", motif: "Cr\u00e9dit en d\u00e9faut non r\u00e9gularis\u00e9" }

  SI clientSuspect(clientId):
    RETOURNER { decision: "REJET", motif: "Compte sous surveillance" }

  // 7. Calculer le score collectif si applicable
  bonusCollectif = 0
  SI clientDansTontineActive(clientId):
    scoreGroupe = calculerScoreGroupe(clientId)
    bonusCollectif = scoreGroupe.bonus  // Peut \u00eatre n\u00e9gatif (malus)

  // 8. Appliquer la d\u00e9cision
  scoreAjuste = irf.scoreTotal + bonusCollectif

  SI scoreAjuste >= palier.seuilAutoApproval ET montantDemande <= palier.montantAutoApproval:
    RETOURNER {
      decision: "APPROUVE_AUTO",
      scoreIRF: irf.scoreTotal,
      bonusCollectif,
      palier: palier.nom,
      taux: palier.taux,
      conditionsSpeciales: palier.conditions,
      expirationOffre: DANS_30_JOURS,
      // Audit trail
      facteurs: irf.axes,
      seuilFranchi: palier.seuilAutoApproval,
      configVersion: config.version
    }

  SI scoreAjuste >= palier.seuilMinimal:
    RETOURNER {
      decision: "VALIDATION_HUMAINE_REQUISE",
      scoreIRF: irf.scoreTotal,
      bonusCollectif,
      palier: palier.nom,
      niveauValidation: determinerNiveauValidation(montantDemande, palier),
      facteurs: irf.axes,
      recommandationMoteur: "FAVORABLE",
      pointsAttention: irf.alertes
    }

  // En dessous du seuil minimal
  RETOURNER {
    decision: "REFUS_DOUX",
    scoreIRF: irf.scoreTotal,
    motif: "Score relationnel insuffisant pour ce montant",
    recommandations: genererRecommandationsPersonnalisees(irf, montantDemande),
    montantAlternatif: calculerMontantAccessible(irf, palier),
    prochainRecalcul: prochaineDateRecalcul(clientId)
  }
```

### 4.2 Niveaux de validation humaine

| Crit\u00e8re | Agent de cr\u00e9dit | Chef d'agence | Comit\u00e9 | Direction |
|----------|-----------------|---------------|---------|-----------|
| Montant \u2264 100k + IRF N3+ | Auto | - | - | - |
| Montant \u2264 500k + IRF N2+ | Recommande | **Valide** | - | - |
| Montant \u2264 2M + IRF N3+ | Recommande | Recommande | **Valide** | - |
| Montant > 2M | Recommande | Recommande | Recommande | **Valide** |
| IRF < N2 (tout montant) | Recommande | **Valide** | - | - |
| D\u00e9faut r\u00e9gularis\u00e9 < 6 mois | Recommande | Recommande | **Valide** | - |

### 4.3 Concept de "Refus doux"

Le CRI ne dit jamais simplement "Non". Il dit "Pas encore, et voici comment y arriver" :

```typescript
interface RefusDoux {
  decision: "REFUS_DOUX";
  scoreActuel: number;
  scoreRequis: number;
  ecart: number;

  // Recommandations actionables class\u00e9es par impact
  recommandations: {
    action: string;           // "Effectuer 3 d\u00e9p\u00f4ts r\u00e9guliers"
    impactEstime: number;     // +45 points IRF
    delaiEstime: string;      // "3 mois"
    axeConcerne: string;      // "SAVINGS"
  }[];

  // Montant alternatif accessible imm\u00e9diatement
  montantAlternatif: number | null;

  // Date estim\u00e9e d'\u00e9ligibilit\u00e9 si recommandations suivies
  dateEligibiliteEstimee: Date;
}
```

---

## 5. Mod\u00e8le d'\u00e9v\u00e9nements d\u00e9clencheurs

### 5.1 \u00c9v\u00e9nements qui d\u00e9clenchent un recalcul IRF

Chaque \u00e9v\u00e9nement est class\u00e9 par **impact** (haut = recalcul imm\u00e9diat, moyen = batch journalier,
bas = batch hebdomadaire) :

| \u00c9v\u00e9nement | DomainEventType existant | Impact | Delta IRF typique |
|-----------|--------------------------|--------|-------------------|
| **Remboursement re\u00e7u \u00e0 temps** | `CREDIT_INSTALLMENT_PAID` (nouveau) | Moyen | +5 \u00e0 +15 |
| **Remboursement en retard** | `CREDIT_INSTALLMENT_LATE` | **Haut** | -20 \u00e0 -80 |
| **Cr\u00e9dit sold\u00e9** | `CREDIT_PAID_OFF` | **Haut** | +30 \u00e0 +60 |
| **D\u00e9faut de paiement** | `CREDIT_OVERDUE` | **Haut** | -100 \u00e0 -200 |
| **D\u00e9p\u00f4t effectu\u00e9** | `ACCOUNT_DEPOSIT` | Bas | +2 \u00e0 +10 |
| **Retrait important** | `ACCOUNT_WITHDRAWAL` | Moyen | -5 \u00e0 -15 |
| **Cotisation tontine pay\u00e9e** | `TONTINE_CONTRIBUTION_RECEIVED` | Moyen | +5 \u00e0 +15 |
| **Cotisation tontine manqu\u00e9e** | `TONTINE_CONTRIBUTION_OVERDUE` | **Haut** | -15 \u00e0 -40 |
| **P\u00e9nalit\u00e9 tontine** | `TONTINE_PENALTY_APPLIED` | **Haut** | -10 \u00e0 -30 |
| **Nouveau cycle tontine** | `TONTINE_CYCLE_STARTED` | Bas | +5 |
| **Compte ouvert** | `ACCOUNT_CREATED` | Bas | +5 \u00e0 +10 |
| **Compte ferm\u00e9** | `ACCOUNT_CLOSED` | Moyen | -10 \u00e0 -20 |
| **Mobile Money success** | `MOBILE_MONEY_SUCCESS` (nouveau) | Bas | +3 \u00e0 +8 |
| **KYC complet\u00e9** | `CLIENT_KYC_COMPLETED` (nouveau) | Bas | +10 \u00e0 +20 |

### 5.2 Architecture de traitement

```
\u00c9v\u00e9nement Domain
      \u2502
      \u25bc
\u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
\u2502  IRF Event Listener          \u2502
\u2502                                \u2502
\u2502  1. Identifier le client      \u2502
\u2502  2. Classifier l'impact       \u2502
\u2502  3. \u00c9crire dans irfEventLog   \u2502
\u2502  4. D\u00e9cider du recalcul       \u2502
\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518
              \u2502
    \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2534\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510
    \u25bc                   \u25bc
HAUT IMPACT         MOYEN/BAS IMPACT
(synchrone)         (asynchrone)
    \u2502                   \u2502
    \u25bc                   \u25bc
calculerIRF()     File d'attente
imm\u00e9diat           (cron journalier
                    ou hebdomadaire)
```

### 5.3 Nouveaux DomainEventTypes \u00e0 ajouter

```typescript
// \u00c0 ajouter \u00e0 event-types.ts
export type DomainEventType =
  // ... existants ...
  // IRF lifecycle
  | "IRF_RECALCULATED"          // Score recalcul\u00e9
  | "IRF_LEVEL_CHANGED"         // Changement de niveau (mont\u00e9e ou descente)
  | "IRF_DEGRADATION_WARNING"   // Alerte de d\u00e9gradation imminente
  | "IRF_DECISION_RENDERED"     // D\u00e9cision d'octroi rendue
  | "IRF_TIER_UPGRADED"         // Client promu au palier sup\u00e9rieur
  | "IRF_TIER_DOWNGRADED"       // Client r\u00e9trograd\u00e9
  | "IRF_REHABILITATION_START"  // D\u00e9but du parcours de r\u00e9habilitation
  | "IRF_REHABILITATION_END"    // R\u00e9habilitation termin\u00e9e
  // Compl\u00e9ments existants
  | "CREDIT_INSTALLMENT_PAID"   // \u00c9ch\u00e9ance pay\u00e9e (\u00e0 temps)
  | "MOBILE_MONEY_SUCCESS"      // Transaction MoMo r\u00e9ussie (impact IRF)
  | "CLIENT_KYC_COMPLETED"      // KYC finalis\u00e9
```

---

## 6. Cr\u00e9dit progressif et paliers

### 6.1 Table des paliers par d\u00e9faut

Les paliers sont **configurables par l'IMF** via `irfCreditTiers`. Voici la configuration initiale
recommand\u00e9e pour le contexte Congo-Brazzaville :

| Niveau IRF | Montant max | Dur\u00e9e max | Taux mensuel | Encours max | Auto-approval max | Fr\u00e9quence min |
|-----------|-------------|-----------|-------------|-------------|-------------------|---------------|
| **N0** | 0 | - | - | 0 | 0 | - |
| **N1** | 100 000 | 3 mois | 5.0% | 100 000 | 0 (humain requis) | Hebdomadaire |
| **N2** | 500 000 | 6 mois | 4.5% | 750 000 | 100 000 | Hebdomadaire |
| **N3** | 2 000 000 | 12 mois | 3.5% | 3 000 000 | 500 000 | Mensuel |
| **N4** | 5 000 000 | 18 mois | 3.0% | 7 500 000 | 1 000 000 | Mensuel |
| **N5** | 10 000 000 | 24 mois | 2.5% | 15 000 000 | 2 000 000 | Mensuel |
| **N6** | 20 000 000 | 36 mois | 2.0% | 25 000 000 | 5 000 000 | Mensuel |

> **Note COBAC** : Les montants et taux ci-dessus sont des plafonds CRI.
> Ils restent soumis au taux d'usure COBAC et aux ratios prudentiels de l'IMF.

### 6.2 Conditions sp\u00e9ciales par niveau

```typescript
interface ConditionsPalier {
  // Avantages progressifs
  fraisEngagementReduit: boolean;     // N4+ : r\u00e9duction 25%
  differePaiement: number;            // N5+ : 1 mois de diff\u00e9r\u00e9 possible
  renouvellementAccelere: boolean;    // N3+ : renouvellement sans enqu\u00eate terrain
  assuranceIncluse: boolean;          // N5+ : assurance d\u00e9c\u00e8s incluse

  // Contraintes progressives relax\u00e9es
  garantieRequise: "AUCUNE" | "EPARGNE_BLOQUEE" | "CAUTION_SOLIDAIRE" | "GARANTIE_PHYSIQUE";
  enqueteTerrainRequise: boolean;
  comiteRequis: boolean;
}

// Exemple N4 :
{
  fraisEngagementReduit: true,       // -25%
  differePaiement: 0,
  renouvellementAccelere: true,      // Pas d'enqu\u00eate si renouvellement
  assuranceIncluse: false,
  garantieRequise: "EPARGNE_BLOQUEE", // 10% du montant en \u00e9pargne bloqu\u00e9e
  enqueteTerrainRequise: false,       // Pour renouvellement uniquement
  comiteRequis: false                 // Si < seuil auto-approval
}
```

### 6.3 Transition entre paliers

```
REGLE: Mont\u00e9e de palier
  - Le score IRF doit \u00eatre dans la plage du niveau sup\u00e9rieur
    pendant AU MOINS 2 recalculs cons\u00e9cutifs (stabilit\u00e9)
  - Le client ne doit avoir aucun cr\u00e9dit en retard
  - Le dernier cr\u00e9dit doit \u00eatre sold\u00e9 ou en cours sans incident

REGLE: Descente de palier
  - Imm\u00e9diate si le score tombe dans la plage inf\u00e9rieure
  - Pas de d\u00e9lai de gr\u00e2ce (asym\u00e9trie de confiance)
  - Notification au client et \u00e0 l'agent r\u00e9f\u00e9rent
```

---

## 7. Intelligence collective

### 7.1 Score de groupe

Chaque tontine g\u00e9r\u00e9e par l'IMF poss\u00e8de un **score collectif** calcul\u00e9 \u00e0 partir
du comportement agr\u00e9g\u00e9 de ses membres :

```
FONCTION calculerScoreGroupe(tontineId):

  membres = getMembresActifs(tontineId)

  // Moyenne pond\u00e9r\u00e9e des IRF individuels
  sommeIRF = 0
  poidsTotal = 0
  POUR CHAQUE membre DANS membres:
    irf = getLastSnapshot(membre.clientId)
    poids = SI membre.estGestionnaire ALORS 1.5 SINON 1.0
    sommeIRF += irf.scoreTotal * poids
    poidsTotal += poids

  moyenneIRF = sommeIRF / poidsTotal

  // Taux de cotisation collective
  tauxCotisation = tontine.cotisationsRecues / tontine.cotisationsDues

  // P\u00e9nalit\u00e9s collectives
  tauxPenalites = tontine.nombrePenalites / (membres.length * tontine.nombreCycles)

  // Score groupe (0-100)
  scoreGroupe = (moyenneIRF / 10)           // 0-100 (IRF normalis\u00e9)
              * tauxCotisation               // Facteur 0-1
              * (1 - tauxPenalites * 0.5)    // P\u00e9nalit\u00e9 pour incidents

  RETOURNER {
    scoreGroupe: CLAMP(0, 100, scoreGroupe),
    nombreMembres: membres.length,
    moyenneIRF,
    tauxCotisation,
    tauxPenalites
  }
```

### 7.2 Bonus/Malus collectif

Le score de groupe impacte l'IRF individuel de chaque membre :

| Score groupe | Effet sur IRF individuel |
|-------------|--------------------------|
| 80\u2013100 | **+50 points** (solidarit\u00e9 exemplaire) |
| 60\u201379 | **+25 points** (groupe sain) |
| 40\u201359 | **0 points** (neutre) |
| 20\u201339 | **-25 points** (groupe fragile) |
| 0\u201319 | **-50 points** (groupe \u00e0 risque) |

### 7.3 D\u00e9tection des risques collectifs

```
REGLE: Contagion de d\u00e9faut
  SI >= 30% des membres d'une tontine ont un IRF < N2:
    \u00c9mettre "IRF_GROUP_RISK_DETECTED"
    R\u00e9duire le bonus collectif \u00e0 0
    Alerter le gestionnaire de la tontine
    Alerter le chef d'agence

REGLE: Effet domino
  SI un membre en d\u00e9faut repr\u00e9sente > 20% du pot total:
    Bloquer les nouvelles distributions
    \u00c9mettre "IRF_GROUP_DOMINO_RISK"
    D\u00e9clencher un audit tontine

REGLE: Comportement opportuniste
  SI un client rejoint une tontine \u00e0 haut score juste avant une demande de cr\u00e9dit:
    (anciennet\u00e9 dans la tontine < 3 mois ET demande de cr\u00e9dit en cours)
    Ignorer le bonus collectif pour ce client
    Logger "OPPORTUNISTIC_BEHAVIOR_DETECTED"
```

---

## 8. R\u00e9trogradation et r\u00e9habilitation

### 8.1 \u00c9v\u00e9nements de r\u00e9trogradation

| \u00c9v\u00e9nement d\u00e9clencheur | Impact IRF | D\u00e9lai de r\u00e9cup\u00e9ration |
|-------------------------|-----------|--------------------------|
| 1 \u00e9ch\u00e9ance en retard (\u22647j) | -30 | 2 mois sans incident |
| 1 \u00e9ch\u00e9ance en retard (8-30j) | -60 | 4 mois sans incident |
| 1 \u00e9ch\u00e9ance en retard (>30j) | -100 | 6 mois sans incident |
| D\u00e9faut d\u00e9clar\u00e9 (>90j) | -200 | 12 mois apr\u00e8s r\u00e9gularisation |
| 2+ \u00e9ch\u00e9ances en retard simultan\u00e9es | -150 | 6 mois sans incident |
| Cotisation tontine manqu\u00e9e | -25 | 2 mois d'assiduit\u00e9 |
| Retrait massif (\u00e9pargne vid\u00e9e) | -40 | 3 mois de d\u00e9p\u00f4ts r\u00e9guliers |
| Compte ferm\u00e9 | -30 | R\u00e9ouverture + 3 mois d'activit\u00e9 |
| Fraude d\u00e9tect\u00e9e | -500 (plancher N0) | **Comit\u00e9 uniquement** |

### 8.2 Parcours de r\u00e9habilitation

Quand un client passe en dessous de N2 suite \u00e0 un d\u00e9faut, un **parcours de
r\u00e9habilitation** structur\u00e9 est propos\u00e9 :

```
PROCESSUS R\u00e9habilitation(clientId):

  // 1. Diagnostic
  irf = getLastSnapshot(clientId)
  causes = identifierCausesRetrogradation(clientId)

  // 2. G\u00e9n\u00e9rer le plan de r\u00e9habilitation personnalis\u00e9
  plan = {
    clientId,
    dateDebut: NOW(),
    dureeEstimee: null,  // Calcul\u00e9e ci-dessous
    etapes: [],
    scoreObjectif: seuil_N2  // 300 points minimum
  }

  // \u00c9tape 1 : R\u00e9gularisation (obligatoire si d\u00e9faut)
  SI causes.includes("DEFAUT_CREDIT"):
    plan.etapes.push({
      ordre: 1,
      action: "REGULARISER_CREDIT",
      description: "Solder ou restructurer le cr\u00e9dit en d\u00e9faut",
      critereValidation: "Aucun cr\u00e9dit en statut LATE ou DEFAULTED",
      impactIRF: +50,
      obligatoire: true
    })

  // \u00c9tape 2 : Reconstruction de l'\u00e9pargne
  plan.etapes.push({
    ordre: 2,
    action: "RECONSTITUER_EPARGNE",
    description: "Effectuer au moins 1 d\u00e9p\u00f4t par semaine pendant 3 mois",
    critereValidation: "12 d\u00e9p\u00f4ts minimum sur 3 mois calendaires",
    impactIRF: +30 \u00e0 +60,
    obligatoire: true
  })

  // \u00c9tape 3 : R\u00e9int\u00e9gration tontine (si applicable)
  SI causes.includes("PENALITES_TONTINE") OU client.avaitTontine:
    plan.etapes.push({
      ordre: 3,
      action: "REINTEGRER_TONTINE",
      description: "Rejoindre ou r\u00e9int\u00e9grer une tontine et cotiser r\u00e9guli\u00e8rement",
      critereValidation: "3 cotisations cons\u00e9cutives \u00e0 temps",
      impactIRF: +20 \u00e0 +40,
      obligatoire: false
    })

  // \u00c9tape 4 : P\u00e9riode d'observation
  plan.etapes.push({
    ordre: 4,
    action: "PERIODE_OBSERVATION",
    description: "Maintenir le comportement pendant 3 mois suppl\u00e9mentaires",
    critereValidation: "Aucun incident sur 90 jours cons\u00e9cutifs",
    impactIRF: +20 (continuit\u00e9),
    obligatoire: true
  })

  plan.dureeEstimee = calculerDureeEstimee(plan.etapes)

  // 3. Persister et notifier
  INSERT INTO irfRehabilitationPlans(plan)
  emettre("IRF_REHABILITATION_START", { clientId, plan })
  notifierClient(clientId, "Votre parcours de r\u00e9habilitation a d\u00e9marr\u00e9")
  notifierAgent(client.agentReferentId, "Client en r\u00e9habilitation")

  RETOURNER plan
```

### 8.3 Suivi automatique de la r\u00e9habilitation

```
// Cron quotidien
POUR CHAQUE plan ACTIF DANS irfRehabilitationPlans:
  client = getClient(plan.clientId)
  etapeEnCours = getEtapeEnCours(plan)

  SI etapeEnCours.critereValidation SATISFAIT:
    marquerEtapeComplete(plan, etapeEnCours)
    emettre("IRF_REHABILITATION_STEP_COMPLETE", { clientId, etape })

    SI toutesEtapesCompletes(plan):
      completerRehabilitation(plan)
      emettre("IRF_REHABILITATION_END", { clientId })
      // Recalcul IRF imm\u00e9diat
      calculerIRF(plan.clientId, getConfigActive())
```

---

## 9. Int\u00e9gration offline

### 9.1 Score IRF offline (approximation locale)

Le client mobile (agent terrain) peut calculer une **\u00e9ligibilit\u00e9 minimale** sans connexion,
en s'appuyant sur les donn\u00e9es cach\u00e9es localement.

```typescript
// client/src/lib/irf-offline.ts

interface IRFOfflineResult {
  eligible: boolean;
  niveauEstime: "N0" | "N1" | "N2" | "N3_PLUS";  // Pr\u00e9cision limit\u00e9e offline
  montantMaxEstime: number;
  confidence: "LOW" | "MEDIUM";                    // Jamais HIGH offline
  avertissement: string;
  derniereSync: Date;
  expirationCache: Date;
}

function calculerIRFOffline(clientId: string): IRFOfflineResult {
  // 1. R\u00e9cup\u00e9rer le dernier snapshot cach\u00e9
  const cache = offlineDb.getCachedIRF(clientId);

  // 2. V\u00e9rifier la fra\u00eecheur (max 7 jours)
  if (!cache || daysSince(cache.syncedAt) > 7) {
    return {
      eligible: false,
      niveauEstime: "N0",
      montantMaxEstime: 0,
      confidence: "LOW",
      avertissement: "Donn\u00e9es obsol\u00e8tes. Synchronisation requise.",
      derniereSync: cache?.syncedAt,
      expirationCache: null
    };
  }

  // 3. Appliquer un facteur de s\u00e9curit\u00e9 (conservatisme offline)
  const scoreAjuste = Math.floor(cache.scoreTotal * 0.85);  // -15% de marge
  const niveau = determinerNiveauAvecMarge(scoreAjuste);

  // 4. Limiter le montant auto-approvable offline
  const palier = getPalierCacheForNiveau(niveau);
  const montantMaxOffline = Math.min(
    palier.montantAutoApproval * 0.5,  // 50% du seuil auto online
    100000  // Plafond absolu offline : 100 000 FCFA
  );

  return {
    eligible: niveau !== "N0",
    niveauEstime: niveau,
    montantMaxEstime: montantMaxOffline,
    confidence: daysSince(cache.syncedAt) <= 3 ? "MEDIUM" : "LOW",
    avertissement: "Estimation offline. Le montant d\u00e9finitif sera confirm\u00e9 apr\u00e8s synchronisation.",
    derniereSync: cache.syncedAt,
    expirationCache: addDays(cache.syncedAt, 7)
  };
}
```

### 9.2 Gestion des \u00e9carts offline vs online

```
LORS DE LA SYNCHRONISATION:

  // 1. R\u00e9cup\u00e9rer les d\u00e9cisions prises offline
  decisionsOffline = getDecisionsOfflineNonSync()

  POUR CHAQUE decision DANS decisionsOffline:
    // 2. Recalculer l'IRF avec les donn\u00e9es compl\u00e8tes (online)
    irfOnline = calculerIRF(decision.clientId, getConfigActive())

    // 3. Comparer
    ecart = irfOnline.scoreTotal - decision.scoreOfflineUtilise

    SI ecart >= -50:
      // \u00c9cart acceptable : valider la d\u00e9cision offline
      confirmerDecisionOffline(decision, irfOnline)

    SI ecart < -50 ET ecart >= -150:
      // \u00c9cart significatif : escalader pour validation humaine
      escaladerDecision(decision, {
        motif: "Ecart IRF offline/online significatif",
        scoreOffline: decision.scoreOfflineUtilise,
        scoreOnline: irfOnline.scoreTotal,
        ecart
      })

    SI ecart < -150:
      // \u00c9cart critique : suspendre le cr\u00e9dit
      suspendreCredit(decision.creditId, {
        motif: "Ecart IRF critique post-synchronisation",
        scoreOffline: decision.scoreOfflineUtilise,
        scoreOnline: irfOnline.scoreTotal
      })
      alerterDirection(decision)
```

---

## 10. S\u00e9curit\u00e9 et contr\u00f4le du risque

### 10.1 Plafonds automatiques

```typescript
interface PlafondsCRI {
  // Par agent
  agentApprovalMaxJour: number;        // Max total approuv\u00e9 par jour par agent
  agentApprovalMaxMois: number;        // Max total approuv\u00e9 par mois par agent
  agentNombreMaxJour: number;          // Max nombre de cr\u00e9dits par jour par agent

  // Par agence
  agenceEncoursTotalMax: number;       // Encours max de l'agence
  agenceApprovalAutoMaxJour: number;   // Max auto-approvals par jour

  // Offline sp\u00e9cifique
  offlineApprovalMaxParSession: number;  // Max par session offline
  offlineMontantAbsoluMax: number;       // Plafond offline absolu
  offlineDureeMaxCache: number;          // Dur\u00e9e max du cache IRF (jours)

  // Global
  tauxDefautMaxAutoApproval: number;   // Si taux d\u00e9faut global > X%, d\u00e9sactiver auto
  killSwitchSeuil: number;             // Seuil de d\u00e9clenchement automatique
}
```

### 10.2 D\u00e9tection des comportements opportunistes

```
REGLE: Manipulation du score
  // D\u00e9tection de d\u00e9p\u00f4ts artificiels avant demande de cr\u00e9dit
  SI montantDepots7Jours > 3 * montantDepotMoyenMensuel
  ET demandeCredit EN COURS:
    flagger("DEPOT_ARTIFICIEL_SUSPECT")
    exclure ces d\u00e9p\u00f4ts du calcul SAVINGS
    logger dans irfEventLog

REGLE: Fraude aux tontines
  // Client qui cr\u00e9e/rejoint des tontines fant\u00f4mes
  SI tontine.nombreMembres < 3
  ET client EST gestionnaire:
    ignorer cette tontine dans le calcul IRF
    flagger("TONTINE_SUSPECTE")

REGLE: Cycling (emprunt pour rembourser)
  SI remboursementCredit.source == "AUTRE_CREDIT"
  OU remboursement dans les 48h apr\u00e8s un nouveau d\u00e9caissement:
    flagger("CYCLING_SUSPECT")
    d\u00e9clencher audit automatique

REGLE: Collusion agent-client
  SI agent.tauxApprobation > 95%
  ET agent.tauxDefaut > moyenneAgence * 2:
    flagger("COLLUSION_SUSPECTE")
    alerter chef d'agence
    r\u00e9duire plafonds agent de 50%
```

### 10.3 Kill-switch central

```
FONCTION verifierKillSwitch():
  config = getKillSwitchConfig()

  // Indicateurs surveill\u00e9s
  tauxDefautGlobal = calculerTauxDefaut(periode=30jours)
  volumeAutoApproval24h = getVolumeAutoApproval(24h)
  anomaliesDetectees = getAnomalies24h()

  // D\u00e9clenchement automatique
  SI tauxDefautGlobal > config.seuilDefaut:           // Ex: 8%
    activerKillSwitch("AUTO", "Taux de d\u00e9faut > " + config.seuilDefaut + "%")

  SI volumeAutoApproval24h > config.seuilVolume:      // Ex: 50M FCFA
    activerKillSwitch("AUTO", "Volume auto-approval excessif")

  SI anomaliesDetectees > config.seuilAnomalies:      // Ex: 10 anomalies
    activerKillSwitch("AUTO", "Nombre d'anomalies excessif")

FONCTION activerKillSwitch(type, motif):
  // D\u00e9sactive TOUTES les auto-approbations
  UPDATE irfKillSwitch SET actif = true, motif, activePar = type, activeA = NOW()

  // Notifier imm\u00e9diatement
  notifierDirection("KILL_SWITCH_ACTIVE", motif)
  notifierTousAgents("AUTO_APPROVAL_DESACTIVE")

  // Logger
  INSERT INTO irfEventLog { type: "KILL_SWITCH_ACTIVATED", motif, severity: "CRITICAL" }
```

---

## 11. Checklist conformit\u00e9 COBAC

### 11.1 Principes de prudence COBAC respect\u00e9s

| # | Exigence COBAC | Impl\u00e9mentation CRI | Statut |
|---|----------------|----------------------|--------|
| 1 | **Plafonnement des engagements** | `irfCreditTiers.encoursMax` par niveau + plafond global par agence | \u2705 |
| 2 | **Division des risques** | Un client ne peut pas repr\u00e9senter > X% de l'encours total agence | \u2705 |
| 3 | **Provisionnement des cr\u00e9ances** | Cr\u00e9dits LATE > 90j automatiquement provisionn\u00e9s \u00e0 100% | \u2705 |
| 4 | **Classification des cr\u00e9ances** | Sain / Sensible / Douteux / Litigieux / Compromis (align\u00e9 sur IRF levels) | \u2705 |
| 5 | **Ratio de liquidit\u00e9** | Contr\u00f4le de l'encours par rapport aux d\u00e9p\u00f4ts | \u2705 |
| 6 | **Fonds propres / risques** | Kill-switch d\u00e9sactive auto-approval si ratio < seuil | \u2705 |
| 7 | **Limitation des pr\u00eats aux dirigeants/apparent\u00e9s** | Flag sp\u00e9cial + validation comit\u00e9 obligatoire | \u2705 |
| 8 | **Contr\u00f4le interne** | Double validation (maker-checker) au-dessus des seuils | \u2705 |

### 11.2 Tra\u00e7abilit\u00e9 compl\u00e8te des d\u00e9cisions

Chaque d\u00e9cision CRI produit un **rapport d'audit** structur\u00e9 :

```typescript
interface RapportDecisionCRI {
  // Identification
  id: string;                        // UUID unique
  timestamp: Date;                   // Horodatage pr\u00e9cis
  clientId: string;
  demandeId: string;

  // Score et niveau
  scoreIRF: number;                  // Score au moment de la d\u00e9cision
  niveauIRF: string;                 // N0-N6
  scoreAxes: {                       // D\u00e9tail par axe
    REPAYMENT: { score: number; max: number; facteurs: string[] };
    SAVINGS: { score: number; max: number; facteurs: string[] };
    TONTINE: { score: number; max: number; facteurs: string[] };
    TENURE: { score: number; max: number; facteurs: string[] };
    CAPACITY: { score: number; max: number; facteurs: string[] };
    FIELD: { score: number; max: number; facteurs: string[] };
  };

  // Intelligence collective
  bonusCollectif: number;
  scoreGroupeSource: string | null;  // tontineId

  // D\u00e9cision
  decision: "APPROUVE_AUTO" | "VALIDATION_HUMAINE_REQUISE" | "REFUS_DOUX" | "REJET" | "BLOQUE";
  motif: string;

  // Seuils de r\u00e9f\u00e9rence
  seuilAutoApproval: number;
  seuilMinimal: number;
  palierApplique: string;

  // Montants
  montantDemande: number;
  montantApprouve: number | null;
  montantMaxPalier: number;

  // Contr\u00f4les effectu\u00e9s
  controles: {
    killSwitch: boolean;             // \u00c9tait-il actif ?
    encoursTotalOk: boolean;
    plafondAgentOk: boolean;
    plafondAgenceOk: boolean;
    defautActif: boolean;
    fraudeDetectee: boolean;
    opportunismeDetecte: boolean;
  };

  // Alertes et recommandations
  alertes: string[];
  recommandations: string[];

  // Validation humaine (si applicable)
  validationRequise: boolean;
  niveauValidation: string | null;
  validateurId: string | null;
  dateValidation: Date | null;

  // Configuration utilis\u00e9e
  configVersion: number;
  ponderations: Record<string, number>;

  // Tra\u00e7abilit\u00e9
  canal: "ONLINE" | "OFFLINE";
  agentId: string | null;
  agenceId: string;
  deviceId: string | null;           // Si offline
}
```

### 11.3 SYSCOHADA r\u00e9vis\u00e9 \u2014 Comptabilisation

| Op\u00e9ration | Compte SYSCOHADA | Nature |
|-----------|-----------------|--------|
| Cr\u00e9dit octroy\u00e9 | 201x - Cr\u00e9dits \u00e0 la client\u00e8le | Actif |
| Int\u00e9r\u00eats courus | 2741 - Produits \u00e0 recevoir | Produit |
| Provision (IRF < N2) | 291x - Provisions pour cr\u00e9ances douteuses | Charge |
| D\u00e9faut (IRF N0 + 90j) | 659x - Cr\u00e9ances irr\u00e9cup\u00e9rables | Perte |
| R\u00e9cup\u00e9ration post-d\u00e9faut | 7595 - Reprises de provisions | Produit |

### 11.4 Checklist d'audit interne

- [ ] Chaque d\u00e9cision d'octroi a un `irfDecisions` associ\u00e9 avec tous les champs remplis
- [ ] L'historique IRF du client est disponible (snapshots sur 24 mois glissants)
- [ ] Les pond\u00e9rations utilis\u00e9es sont trac\u00e9es (`configVersion` dans chaque d\u00e9cision)
- [ ] Les changements de pond\u00e9ration sont log\u00e9s et approuv\u00e9s (audit trail)
- [ ] Les \u00e9v\u00e9nements de r\u00e9trogradation sont document\u00e9s dans `irfEventLog`
- [ ] Les kill-switch sont trac\u00e9s avec motif, d\u00e9clencheur, dur\u00e9e
- [ ] Les d\u00e9cisions offline sont r\u00e9concili\u00e9es dans les 48h suivant la synchronisation
- [ ] Les anomalies d\u00e9tect\u00e9es sont document\u00e9es et r\u00e9solues
- [ ] Les plafonds par agent/agence sont param\u00e9tr\u00e9s et respect\u00e9s
- [ ] Les plans de r\u00e9habilitation sont suivis et document\u00e9s
- [ ] Le rapport mensuel CRI est g\u00e9n\u00e9rable automatiquement
- [ ] L'export CSV/PDF des d\u00e9cisions est disponible pour les inspecteurs COBAC

---

## 12. Sch\u00e9ma de donn\u00e9es

### 12.1 Nouvelles tables

```sql
-- Journal d'\u00e9v\u00e9nements IRF (immuable, append-only)
CREATE TABLE irf_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  event_type TEXT NOT NULL,              -- 'DEPOSIT', 'REPAYMENT_ON_TIME', 'LATE_PAYMENT', etc.
  domain_event_type TEXT,                -- Lien vers DomainEventType existant
  source_table TEXT,                     -- Table source de l'\u00e9v\u00e9nement
  source_id UUID,                        -- ID dans la table source
  impact_category TEXT NOT NULL,         -- 'HIGH', 'MEDIUM', 'LOW'
  delta_score_estimated INTEGER,         -- Impact estim\u00e9 sur le score
  metadata JSONB,                        -- Donn\u00e9es contextuelles
  processed BOOLEAN DEFAULT false,       -- Trait\u00e9 par le moteur IRF ?
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_irf_events_client ON irf_event_log(client_id, created_at);
CREATE INDEX idx_irf_events_unprocessed ON irf_event_log(processed, impact_category);

-- Snapshots IRF (historique du score)
CREATE TABLE irf_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  score_total INTEGER NOT NULL,          -- 0-1000
  niveau TEXT NOT NULL,                  -- N0-N6
  score_repayment INTEGER NOT NULL,
  score_savings INTEGER NOT NULL,
  score_tontine INTEGER NOT NULL,
  score_tenure INTEGER NOT NULL,
  score_capacity INTEGER NOT NULL,
  score_field INTEGER NOT NULL,
  bonus_collectif INTEGER DEFAULT 0,
  facteurs JSONB NOT NULL,               -- Tous les facteurs explicatifs
  alertes TEXT[],                         -- Alertes actives
  config_version INTEGER NOT NULL,       -- Version de la config utilis\u00e9e
  trigger_event TEXT,                    -- \u00c9v\u00e9nement d\u00e9clencheur du recalcul
  canal TEXT DEFAULT 'ONLINE',           -- ONLINE ou OFFLINE
  calculated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_irf_snapshots_client ON irf_snapshots(client_id, calculated_at DESC);
CREATE INDEX idx_irf_snapshots_niveau ON irf_snapshots(niveau);

-- Paliers de cr\u00e9dit (configurables par l'IMF)
CREATE TABLE irf_credit_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  niveau TEXT NOT NULL UNIQUE,           -- N0-N6
  libelle TEXT NOT NULL,
  montant_max NUMERIC NOT NULL,
  duree_max_mois INTEGER NOT NULL,
  taux_mensuel NUMERIC NOT NULL,
  encours_max NUMERIC NOT NULL,
  montant_auto_approval NUMERIC NOT NULL,
  seuil_auto_approval INTEGER NOT NULL,  -- Score IRF min pour auto
  seuil_minimal INTEGER NOT NULL,        -- Score IRF min pour \u00e9ligibilit\u00e9
  frequence_min TEXT,                    -- WEEKLY, MONTHLY
  conditions JSONB,                      -- Conditions sp\u00e9ciales du palier
  actif BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- D\u00e9cisions de cr\u00e9dit IRF (audit trail complet)
CREATE TABLE irf_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  demande_id UUID REFERENCES demandes_credit(id),
  credit_id UUID REFERENCES credits(id),

  -- Score au moment de la d\u00e9cision
  score_irf INTEGER NOT NULL,
  niveau_irf TEXT NOT NULL,
  snapshot_id UUID REFERENCES irf_snapshots(id),

  -- Axes d\u00e9taill\u00e9s
  score_axes JSONB NOT NULL,
  bonus_collectif INTEGER DEFAULT 0,
  score_groupe_id UUID,

  -- D\u00e9cision
  decision TEXT NOT NULL,                -- APPROUVE_AUTO, VALIDATION_HUMAINE, REFUS_DOUX, REJET, BLOQUE
  motif TEXT NOT NULL,

  -- Montants
  montant_demande NUMERIC NOT NULL,
  montant_approuve NUMERIC,
  montant_max_palier NUMERIC NOT NULL,
  montant_alternatif NUMERIC,           -- Si refus doux

  -- Seuils
  seuil_auto_applique INTEGER,
  seuil_minimal_applique INTEGER,
  palier_applique TEXT NOT NULL,

  -- Contr\u00f4les
  controles JSONB NOT NULL,              -- Kill-switch, encours, plafonds, fraude...
  alertes TEXT[],
  recommandations TEXT[],

  -- Validation humaine
  validation_requise BOOLEAN DEFAULT false,
  niveau_validation TEXT,                -- AGENT, CHEF_AGENCE, COMITE, DIRECTION
  validateur_id UUID,
  date_validation TIMESTAMP,
  decision_validateur TEXT,              -- APPROUVE, REJETE, MODIFIE
  commentaire_validateur TEXT,

  -- Tra\u00e7abilit\u00e9
  config_version INTEGER NOT NULL,
  ponderations JSONB NOT NULL,
  canal TEXT DEFAULT 'ONLINE',
  agent_id UUID,
  agence_id UUID NOT NULL,
  device_id TEXT,

  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_irf_decisions_client ON irf_decisions(client_id, created_at DESC);
CREATE INDEX idx_irf_decisions_pending ON irf_decisions(validation_requise, date_validation)
  WHERE validation_requise = true AND date_validation IS NULL;

-- Configuration des pond\u00e9rations (versionn\u00e9e)
CREATE TABLE irf_weight_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL UNIQUE,
  poids_repayment INTEGER NOT NULL DEFAULT 30,
  poids_savings INTEGER NOT NULL DEFAULT 20,
  poids_tontine INTEGER NOT NULL DEFAULT 15,
  poids_tenure INTEGER NOT NULL DEFAULT 15,
  poids_capacity INTEGER NOT NULL DEFAULT 15,
  poids_field INTEGER NOT NULL DEFAULT 5,
  decay_rate_mensuel NUMERIC DEFAULT 0.02,
  lissage_max_pct NUMERIC DEFAULT 0.15,
  bonus_collectif_max INTEGER DEFAULT 50,
  malus_collectif_max INTEGER DEFAULT -50,
  actif BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT poids_total CHECK (
    poids_repayment + poids_savings + poids_tontine
    + poids_tenure + poids_capacity + poids_field = 100
  )
);

-- Score de groupe (tontines)
CREATE TABLE irf_group_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tontine_id UUID NOT NULL REFERENCES tontines(id),
  score_groupe INTEGER NOT NULL,         -- 0-100
  nombre_membres INTEGER NOT NULL,
  moyenne_irf NUMERIC NOT NULL,
  taux_cotisation NUMERIC NOT NULL,
  taux_penalites NUMERIC NOT NULL,
  bonus_individuel INTEGER NOT NULL,     -- Points IRF ajout\u00e9s/retir\u00e9s aux membres
  alertes TEXT[],
  calculated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_irf_group_tontine ON irf_group_scores(tontine_id, calculated_at DESC);

-- Kill-switch
CREATE TABLE irf_kill_switch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actif BOOLEAN NOT NULL DEFAULT false,
  motif TEXT,
  type TEXT NOT NULL,                    -- AUTO, MANUAL
  active_par TEXT,                       -- user_id ou 'SYSTEM'
  active_a TIMESTAMP,
  desactive_par TEXT,
  desactive_a TIMESTAMP,
  indicateurs JSONB,                     -- M\u00e9triques au moment de l'activation
  created_at TIMESTAMP DEFAULT NOW()
);

-- Plans de r\u00e9habilitation
CREATE TABLE irf_rehabilitation_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  score_depart INTEGER NOT NULL,
  score_objectif INTEGER NOT NULL,
  statut TEXT NOT NULL DEFAULT 'ACTIF',  -- ACTIF, COMPLETE, ABANDONNE
  date_debut TIMESTAMP DEFAULT NOW(),
  date_fin_estimee TIMESTAMP,
  date_fin_reelle TIMESTAMP,
  etapes JSONB NOT NULL,                 -- Array d'\u00e9tapes structur\u00e9es
  etape_courante INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_irf_rehab_client ON irf_rehabilitation_plans(client_id);
CREATE INDEX idx_irf_rehab_actif ON irf_rehabilitation_plans(statut) WHERE statut = 'ACTIF';
```

---

## 13. Int\u00e9gration avec l'existant

### 13.1 Mapping avec le syst\u00e8me actuel

| Composant existant | \u00c9volution CRI | Impact |
|-------------------|----------------|--------|
| `microfinance-scoring.ts` | **Remplac\u00e9** par le moteur IRF (6 axes, 0-1000) | Le scoring actuel (0-100) devient un sous-ensemble de l'IRF |
| `clients.score` | **Aliment\u00e9** par IRF : `score = ROUND(irfScore / 10)` | Compatibilit\u00e9 descendante |
| `clients.segment` | **D\u00e9riv\u00e9** du niveau IRF : N0-N1=RISQUE, N2=STANDARD, N3-N4=PREMIUM, N5-N6=VIP | Remplacement de la logique actuelle |
| `demandesCredit` | **Enrichi** : ajout `irfDecisionId` (FK vers `irfDecisions`) | Chaque demande porte sa d\u00e9cision CRI |
| `credits` | **Enrichi** : ajout `irfNiveauOctroi` (niveau au moment du d\u00e9caissement) | Tra\u00e7abilit\u00e9 |
| `DomainEventType` | **\u00c9tendu** : 10 nouveaux types IRF | Listage section 5.3 |
| `offline-db.ts` | **\u00c9tendu** : nouveau store `CachedIRF` | Cache du dernier snapshot |
| `credit-workflow.ts` | **Int\u00e9gr\u00e9** : consultation IRF avant chaque transition | Gate keeper |

### 13.2 Points d'int\u00e9gration \u00e9v\u00e9nementiels

```
\u00c9v\u00e9nements existants \u2192 IRF Event Listener :

ACCOUNT_DEPOSIT          \u2192 irfEventLog(SAVINGS, LOW)
ACCOUNT_WITHDRAWAL       \u2192 irfEventLog(SAVINGS, MEDIUM) si > 50% du solde
CREDIT_PAID_OFF          \u2192 irfEventLog(REPAYMENT, HIGH) + recalcul imm\u00e9diat
CREDIT_OVERDUE           \u2192 irfEventLog(REPAYMENT, HIGH) + recalcul imm\u00e9diat
CREDIT_INSTALLMENT_LATE  \u2192 irfEventLog(REPAYMENT, HIGH) + recalcul imm\u00e9diat
TONTINE_CONTRIBUTION_RECEIVED  \u2192 irfEventLog(TONTINE, MEDIUM)
TONTINE_CONTRIBUTION_OVERDUE   \u2192 irfEventLog(TONTINE, HIGH)
TONTINE_PENALTY_APPLIED        \u2192 irfEventLog(TONTINE, HIGH)
CLIENT_CREATED           \u2192 irfEventLog(TENURE, LOW) + snapshot initial N0
PAIEMENT_TERRAIN_VALIDATED \u2192 irfEventLog(FIELD, LOW)
```

### 13.3 Crons \u00e0 ajouter

| Cron | Fr\u00e9quence | Action |
|------|-----------|--------|
| `irf-batch-recalcul` | Quotidien 02h00 | Recalculer les IRF des clients avec \u00e9v\u00e9nements MEDIUM non trait\u00e9s |
| `irf-weekly-recalcul` | Hebdomadaire dim 03h00 | Recalculer les IRF des clients avec \u00e9v\u00e9nements LOW non trait\u00e9s |
| `irf-decay-check` | Quotidien 04h00 | Appliquer la d\u00e9gradation naturelle aux clients inactifs > 90j |
| `irf-group-scores` | Quotidien 05h00 | Recalculer les scores de groupe pour toutes les tontines actives |
| `irf-kill-switch-check` | Toutes les heures | V\u00e9rifier les indicateurs du kill-switch |
| `irf-rehab-check` | Quotidien 06h00 | V\u00e9rifier la progression des plans de r\u00e9habilitation |
| `irf-anomaly-detect` | Quotidien 07h00 | D\u00e9tection des comportements opportunistes |
| `irf-snapshot-cleanup` | Mensuel | Archiver les snapshots > 24 mois |

---

## Annexe A : R\u00e9capitulatif des r\u00e8gles m\u00e9tier

| R\u00e8gle | Description | Configurable ? |
|--------|-------------|----------------|
| R01 | La confiance se perd 3x plus vite qu'elle se gagne | Oui (facteur asym\u00e9trie) |
| R02 | Score IRF limit\u00e9 \u00e0 \u00b115% de variation par recalcul (sauf d\u00e9faut) | Oui (% lissage) |
| R03 | D\u00e9gradation naturelle de 2%/mois apr\u00e8s 90j d'inactivit\u00e9, plancher 50% | Oui (decay rate, seuil) |
| R04 | Mont\u00e9e de palier requiert 2 recalculs cons\u00e9cutifs stables | Oui (nombre recalculs) |
| R05 | Descente de palier imm\u00e9diate (pas de d\u00e9lai de gr\u00e2ce) | Non (principe P3) |
| R06 | Plafond offline = 50% du seuil auto online, max 100k FCFA | Oui (% et plafond) |
| R07 | Cache IRF offline expire apr\u00e8s 7 jours | Oui (dur\u00e9e cache) |
| R08 | \u00c9cart offline/online > 150 = suspension du cr\u00e9dit | Oui (seuil \u00e9cart) |
| R09 | Bonus collectif ignor\u00e9 si anciennet\u00e9 tontine < 3 mois | Oui (dur\u00e9e min) |
| R10 | Kill-switch auto si taux d\u00e9faut global > 8% | Oui (seuil %) |
| R11 | Total pond\u00e9rations = 100% (contrainte SQL) | Oui (r\u00e9partition) |
| R12 | Provisionnement automatique si IRF < N2 et retard > 90j | Non (r\u00e8gle COBAC) |

## Annexe B : Glossaire

| Terme | D\u00e9finition |
|-------|-----------|
| **IRF** | Indice de Relation Financi\u00e8re \u2014 score 0-1000 |
| **CRI** | Cr\u00e9dit Relationnel Intelligent \u2014 le moteur complet |
| **Palier** | Niveau de droits de cr\u00e9dit associ\u00e9 \u00e0 un niveau IRF |
| **Refus doux** | Refus assorti de recommandations pour devenir \u00e9ligible |
| **Decay** | D\u00e9gradation naturelle du score en cas d'inactivit\u00e9 |
| **Lissage** | Limitation de la volatilit\u00e9 du score (\u00b115% par recalcul) |
| **Kill-switch** | M\u00e9canisme d'arr\u00eat d'urgence d\u00e9sactivant les auto-approbations |
| **Bonus collectif** | Ajustement IRF li\u00e9 au score du groupe/tontine |
| **COBAC** | Commission Bancaire de l'Afrique Centrale |
| **SYSCOHADA** | Syst\u00e8me Comptable OHADA (normes comptables CEMAC) |
