# Guide de Test - Module Comptabilité SYSCOHADA

Ce guide décrit comment tester le module comptable SYSCOHADA implémenté pour COFIN&CO-M.

## Architecture du Module

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FLUX MÉTIER (Business Layer)                      │
├─────────────────────────────────────────────────────────────────────┤
│  Dépôt Cash  │  Mobile Money  │  Remboursement  │  Tontine  │  etc │
└──────┬───────┴───────┬────────┴────────┬────────┴─────┬─────┴──────┘
       │               │                 │              │
       ▼               ▼                 ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    LEDGER SERVICE (ledger.ts)                        │
│                    executeWithLedger()                               │
│                    ↓ appelle postToGeneralLedger()                   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│              ACCOUNTING POSTING SERVICE                              │
│              accounting-posting-service.ts                           │
├─────────────────────────────────────────────────────────────────────┤
│  • Idempotence via gl_posting_links                                  │
│  • Règles comptables via accounting_rules                            │
│  • Génération écriture double partie                                 │
│  • Validation période ouverte                                        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BASE DE DONNÉES                                   │
├─────────────────────────────────────────────────────────────────────┤
│  ecritures_comptables  │  lignes_ecritures  │  gl_posting_links     │
│  gl_periods            │  plan_comptable    │  journaux_comptables  │
└─────────────────────────────────────────────────────────────────────┘
```

## Prérequis

1. **Migration appliquée**: Vérifier que la migration `0030_accounting_gl_enhancement.sql` est appliquée
2. **Données de seed**: Les journaux et comptes OHADA doivent exister
3. **Période ouverte**: Une période comptable doit être ouverte pour le mois en cours

### Vérification de la configuration

```sql
-- Vérifier les journaux
SELECT * FROM journaux_comptables;
-- Attendu: CAI, MMTN, MAIR, BNK, VRT, OD, CRD, TON, AN

-- Vérifier les comptes OHADA
SELECT numero_compte, libelle FROM plan_comptable
WHERE numero_compte IN ('571', '5781', '5782', '4111', '2711', '7073');

-- Vérifier les règles comptables
SELECT * FROM accounting_rules WHERE is_active = true;

-- Vérifier les périodes
SELECT * FROM gl_periods WHERE status = 'OPEN';
```

## Scénarios de Test

---

### Scénario 1: Dépôt Cash en Caisse

**Action**: Un client dépose 50 000 FCFA en espèces sur son compte épargne.

**Flux attendu**:
1. L'agent saisit le dépôt dans l'interface caisse
2. Le système crée un mouvement financier (mouvements_financiers)
3. Le posting engine génère automatiquement l'écriture comptable

**Écritures OHADA attendues**:
| Compte | Libellé | Débit | Crédit |
|--------|---------|-------|--------|
| 571 | Caisse | 50 000 | |
| 4111 | Dépôts clients | | 50 000 |

**Vérification**:

```sql
-- 1. Vérifier le mouvement financier
SELECT * FROM mouvements_financiers
WHERE type_mouvement = 'DEPOSIT'
ORDER BY created_at DESC LIMIT 1;

-- 2. Vérifier le lien de posting (idempotence)
SELECT * FROM gl_posting_links
WHERE source_type = 'mouvement_financier'
ORDER BY created_at DESC LIMIT 1;

-- 3. Vérifier l'écriture comptable
SELECT ec.*, le.*
FROM ecritures_comptables ec
JOIN lignes_ecritures le ON le.ecriture_id = ec.id
WHERE ec.id = (SELECT ecriture_id FROM gl_posting_links ORDER BY created_at DESC LIMIT 1);
```

**Dans l'UI**:
1. Aller dans **Comptabilité > Grand Livre**
2. Sélectionner le compte **571 - Caisse**
3. Vérifier que le mouvement apparaît avec le solde progressif correct
4. Sélectionner le compte **4111 - Dépôts clients**
5. Vérifier l'écriture crédit correspondante

---

### Scénario 2: Dépôt Mobile Money MTN

**Action**: Un client dépose 100 000 FCFA via MTN Mobile Money.

**Écritures OHADA attendues**:
| Compte | Libellé | Débit | Crédit |
|--------|---------|-------|--------|
| 5781 | Mobile Money MTN | 100 000 | |
| 4111 | Dépôts clients | | 100 000 |

**Vérification**:

```sql
-- Vérifier l'écriture avec le journal Mobile Money MTN
SELECT ec.*, jc.code as journal_code
FROM ecritures_comptables ec
JOIN journaux_comptables jc ON jc.id = ec.journal_id
WHERE jc.code = 'MMTN'
ORDER BY ec.date_ecriture DESC LIMIT 5;
```

**Dans l'UI**:
1. Aller dans **Comptabilité > Grand Livre**
2. Sélectionner le compte **5781 - Mobile Money MTN**
3. Vérifier le solde progressif

---

### Scénario 3: Dépôt Mobile Money Airtel

**Action**: Un client dépose 75 000 FCFA via Airtel Money.

**Écritures OHADA attendues**:
| Compte | Libellé | Débit | Crédit |
|--------|---------|-------|--------|
| 5782 | Mobile Money Airtel | 75 000 | |
| 4111 | Dépôts clients | | 75 000 |

---

### Scénario 4: Remboursement de Prêt

**Action**: Un client rembourse 25 000 FCFA sur son prêt (dont 20 000 principal + 5 000 intérêts).

**Écritures OHADA attendues**:
| Compte | Libellé | Débit | Crédit |
|--------|---------|-------|--------|
| 571 | Caisse (ou 578x si MM) | 25 000 | |
| 2711 | Prêts aux clients | | 20 000 |
| 7073 | Intérêts sur prêts | | 5 000 |

**Vérification**:

```sql
-- Vérifier via le journal Crédits
SELECT ec.*, jc.code
FROM ecritures_comptables ec
JOIN journaux_comptables jc ON jc.id = ec.journal_id
WHERE jc.code = 'CRD'
ORDER BY ec.date_ecriture DESC;
```

---

### Scénario 5: Contribution Tontine

**Action**: Un membre verse sa cotisation tontine de 10 000 FCFA.

**Écritures OHADA attendues**:
| Compte | Libellé | Débit | Crédit |
|--------|---------|-------|--------|
| 571 | Caisse | 10 000 | |
| 4112 | Fonds tontines | | 10 000 |

**Vérification**:

```sql
-- Vérifier via le journal Tontines
SELECT ec.*, jc.code
FROM ecritures_comptables ec
JOIN journaux_comptables jc ON jc.id = ec.journal_id
WHERE jc.code = 'TON'
ORDER BY ec.date_ecriture DESC;
```

---

### Scénario 6: Payout Tontine (Attribution)

**Action**: Le pot de la tontine (500 000 FCFA) est attribué à un membre.

**Écritures OHADA attendues**:
| Compte | Libellé | Débit | Crédit |
|--------|---------|-------|--------|
| 4112 | Fonds tontines | 500 000 | |
| 571 | Caisse (ou compte bénéficiaire) | | 500 000 |

---

### Scénario 7: Retrait Client

**Action**: Un client retire 30 000 FCFA de son compte épargne.

**Écritures OHADA attendues**:
| Compte | Libellé | Débit | Crédit |
|--------|---------|-------|--------|
| 4111 | Dépôts clients | 30 000 | |
| 571 | Caisse | | 30 000 |

---

## Tests d'Idempotence

### Test: Double posting impossible

**Objectif**: Vérifier qu'un même mouvement ne peut pas être posté deux fois.

**Procédure**:
1. Noter l'ID d'un mouvement financier existant
2. Tenter de le poster manuellement via l'API

```bash
# Simuler un double posting (devrait échouer)
curl -X POST http://localhost:3000/api/comptabilite/post-mouvement \
  -H "Content-Type: application/json" \
  -d '{"mouvementId": 123}'
```

**Résultat attendu**: Le système retourne l'écriture existante sans créer de doublon.

**Vérification SQL**:
```sql
-- Vérifier l'unicité dans gl_posting_links
SELECT source_type, source_id, COUNT(*)
FROM gl_posting_links
GROUP BY source_type, source_id
HAVING COUNT(*) > 1;
-- Attendu: 0 lignes (aucun doublon)
```

---

## Tests de Clôture de Période

### Test: Clôture d'un mois

**Action**: Clôturer le mois de décembre 2025.

**Procédure**:
1. Aller dans **Comptabilité > Périodes** (ou via API)
2. Sélectionner la période décembre 2025
3. Cliquer sur "Clôturer"

```bash
# Via API
curl -X POST http://localhost:3000/api/comptabilite/periods/close \
  -H "Content-Type: application/json" \
  -d '{"annee": 2025, "mois": 12, "agenceId": 1}'
```

**Vérification**:
```sql
SELECT * FROM gl_periods WHERE annee = 2025 AND mois = 12;
-- Attendu: status = 'CLOSED', date_cloture NOT NULL
```

### Test: Blocage d'écriture sur période clôturée

**Action**: Tenter de créer une écriture sur décembre 2025 après clôture.

**Résultat attendu**: Erreur "Période comptable clôturée"

---

## Tests d'Extourne (Reversal)

### Test: Annulation d'une écriture

**Action**: Extourner une écriture erronée.

**Procédure**:
1. Identifier l'ID de l'écriture à extourner
2. Créer l'extourne via l'API

```bash
curl -X POST http://localhost:3000/api/comptabilite/entries/456/reverse \
  -H "Content-Type: application/json" \
  -d '{"motif": "Erreur de saisie - montant incorrect"}'
```

**Vérification**:
```sql
-- Vérifier l'écriture originale
SELECT * FROM ecritures_comptables WHERE id = 456;
-- Attendu: is_reversed = true

-- Vérifier l'écriture d'extourne
SELECT * FROM ecritures_comptables
WHERE reversed_entry_id = 456;
-- Attendu: libelle contient "EXTOURNE", montants inversés
```

**Dans l'UI Grand Livre**:
- L'écriture originale doit apparaître barrée ou marquée "Extournée"
- L'écriture d'extourne doit apparaître juste après
- Le solde progressif doit être correct (effet net = 0)

---

## Tests de l'Interface Grand Livre

### Test: Filtrage par compte

1. Aller dans **Comptabilité > Grand Livre**
2. Sélectionner un compte (ex: 571 Caisse)
3. Vérifier que seuls les mouvements de ce compte s'affichent
4. Vérifier le solde progressif (running balance)

### Test: Filtrage par période

1. Sélectionner une plage de dates
2. Vérifier que les écritures hors période sont exclues
3. Vérifier que le solde d'ouverture est correct

### Test: Export PDF/Excel

1. Afficher le Grand Livre d'un compte
2. Cliquer sur "Exporter PDF"
3. Vérifier le contenu du PDF:
   - En-tête avec nom du compte et période
   - Toutes les lignes avec date, libellé, débit, crédit, solde
   - Totaux en bas de page

---

## Tests de la Balance Générale

### Test: Équilibre débit/crédit

1. Aller dans **Comptabilité > Balance Générale**
2. Vérifier que Total Débits = Total Crédits
3. Si déséquilibre, investiguer les écritures incorrectes

```sql
-- Vérifier l'équilibre global
SELECT
  SUM(debit) as total_debit,
  SUM(credit) as total_credit,
  SUM(debit) - SUM(credit) as ecart
FROM lignes_ecritures le
JOIN ecritures_comptables ec ON ec.id = le.ecriture_id
WHERE ec.status = 'POSTED';
-- Attendu: ecart = 0
```

### Test: Filtrage par classe OHADA

1. Filtrer par classe (ex: "Classe 5 - Financier")
2. Vérifier que seuls les comptes 5xx s'affichent
3. Vérifier les totaux de classe

---

## Vérifications de Conformité OHADA

### Classes de comptes utilisées

| Classe | Description | Comptes types |
|--------|-------------|---------------|
| 1 | Capitaux | 101, 106, 131 |
| 2 | Immobilisations | 2711 (Prêts) |
| 4 | Tiers | 4111 (Clients), 4112 (Tontines) |
| 5 | Financier | 571 (Caisse), 578x (MM) |
| 6 | Charges | 6xx |
| 7 | Produits | 7073 (Intérêts) |

### Vérification des numéros de pièce

```sql
-- Les numéros doivent être séquentiels par journal et année
SELECT
  journal_id,
  EXTRACT(YEAR FROM date_ecriture) as annee,
  MIN(numero_piece) as premier,
  MAX(numero_piece) as dernier,
  COUNT(*) as nb_ecritures
FROM ecritures_comptables
GROUP BY journal_id, EXTRACT(YEAR FROM date_ecriture)
ORDER BY journal_id, annee;
```

---

## Résolution des Problèmes

### Problème: Écriture non générée après mouvement

**Causes possibles**:
1. Aucune règle comptable correspondante
2. Période clôturée
3. Erreur dans le posting engine

**Diagnostic**:
```sql
-- Vérifier si le mouvement a été lié
SELECT * FROM gl_posting_links
WHERE source_id = [mouvement_id] AND source_type = 'mouvement_financier';

-- Si absent, vérifier les règles
SELECT * FROM accounting_rules
WHERE source_type = 'mouvement_financier'
AND event_type = '[type_mouvement]'
AND is_active = true;
```

### Problème: Solde progressif incorrect

**Diagnostic**:
```sql
-- Recalculer le solde manuellement
SELECT
  le.id,
  le.debit,
  le.credit,
  SUM(le.debit - le.credit) OVER (ORDER BY ec.date_ecriture, ec.id) as solde_calcule
FROM lignes_ecritures le
JOIN ecritures_comptables ec ON ec.id = le.ecriture_id
WHERE le.compte_id = [compte_id]
ORDER BY ec.date_ecriture, ec.id;
```

### Problème: Balance déséquilibrée

**Diagnostic**:
```sql
-- Trouver les écritures déséquilibrées
SELECT
  ec.id,
  ec.libelle,
  SUM(le.debit) as total_debit,
  SUM(le.credit) as total_credit
FROM ecritures_comptables ec
JOIN lignes_ecritures le ON le.ecriture_id = ec.id
GROUP BY ec.id, ec.libelle
HAVING SUM(le.debit) != SUM(le.credit);
```

---

## Checklist de Validation

- [ ] Migration 0030 appliquée sans erreur
- [ ] Journaux comptables présents (9 journaux)
- [ ] Comptes OHADA de base présents
- [ ] Règles comptables actives
- [ ] Période courante ouverte
- [ ] Dépôt cash génère écriture 571/4111
- [ ] Dépôt MTN génère écriture 5781/4111
- [ ] Dépôt Airtel génère écriture 5782/4111
- [ ] Remboursement prêt génère écriture correcte
- [ ] Contribution tontine génère écriture
- [ ] Payout tontine génère écriture inverse
- [ ] Retrait client génère écriture
- [ ] Idempotence fonctionne (pas de doublon)
- [ ] Grand Livre affiche running balance
- [ ] Balance Générale équilibrée
- [ ] Clôture période fonctionne
- [ ] Extourne fonctionne
- [ ] Export PDF fonctionne
- [ ] Export Excel fonctionne

---

## Support

Pour toute question sur le module comptable:
1. Vérifier ce guide
2. Consulter les logs serveur pour les erreurs de posting
3. Vérifier les tables gl_posting_links et accounting_rules
