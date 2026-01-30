# AUDIT SYSTÈME DE VIREMENTS ET HISTORIQUE

**Date:** 2026-01-29
**Auditeur:** Claude (Analyse automatisée)
**Scope:** Toutes les opérations financières avec focus sur virements, sens des opérations, et libellés

---

## 1. RÉSUMÉ EXÉCUTIF

### Problèmes Critiques Identifiés

| # | Gravité | Description | Impact |
|---|---------|-------------|--------|
| 1 | **CRITIQUE** | `sens` mal dérivé pour les transferts entrants | Historique affiche DEBIT au lieu de CREDIT pour les virements reçus |
| 2 | **MAJEUR** | Libellés techniques non-bancaires | UX dégradée, difficile de comprendre les opérations |
| 3 | **MINEUR** | Pas de libellé détaillé avec compte source/dest | Traçabilité réduite |

---

## 2. MATRICE DE COUVERTURE - OPÉRATIONS

### 2.1 Types d'Opérations et Sens Attendu

| Type Opération | Code Interne | Sens Attendu | Sens Actuel | Status |
|----------------|--------------|--------------|-------------|--------|
| Dépôt épargne | `DEPOSIT_SAVINGS` | CREDIT | CREDIT | ✅ OK |
| Dépôt courant | `DEPOSIT_CURRENT` | CREDIT | CREDIT | ✅ OK |
| Dépôt bloqué | `DEPOSIT_BLOCKED` | CREDIT | CREDIT | ✅ OK |
| Dépôt initial | `INITIAL_DEPOSIT` | CREDIT | CREDIT | ✅ OK |
| Retrait épargne | `WITHDRAWAL_SAVINGS` | DEBIT | DEBIT | ✅ OK |
| Retrait courant | `WITHDRAWAL_CURRENT` | DEBIT | DEBIT | ✅ OK |
| Retrait bloqué | `WITHDRAWAL_BLOCKED` | DEBIT | DEBIT | ✅ OK |
| **Virement sortant** | `TRANSFER_OUT` | DEBIT | DEBIT | ✅ OK |
| **Virement entrant** | `TRANSFER_IN` | CREDIT | **DEBIT** | ❌ **BUG** |
| Virement interne | `INTERNAL_TRANSFER` | Contexte | ? | ⚠️ À vérifier |
| Paiement intérêts | `INTEREST_PAYMENT` | CREDIT | CREDIT | ✅ OK |
| Remboursement crédit | `CREDIT_REPAYMENT` | DEBIT | DEBIT | ✅ OK |
| Décaissement crédit | `CREDIT_DISBURSEMENT` | CREDIT | CREDIT | ✅ OK |
| Cotisation tontine | `TONTINE_CONTRIBUTION` | DEBIT | DEBIT | ✅ OK |
| Retrait tontine | `TONTINE_WITHDRAWAL` | CREDIT | CREDIT | ✅ OK |
| Frais engagement | `ENGAGEMENT_FEE` | DEBIT | DEBIT | ✅ OK |
| Ajustement | `ADJUSTMENT` | Contexte | ? | ⚠️ À vérifier |
| Liquidation | `LIQUIDATION` | DEBIT | DEBIT | ✅ OK |

### 2.2 Flux de Données - Virement Programmé

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     FLUX VIREMENT PROGRAMMÉ ACTUEL                          │
└─────────────────────────────────────────────────────────────────────────────┘

scheduled-transfers-service.ts:
executeCompteTransferInTx()

    ┌─────────────────────────────────────────────────────────────────────┐
    │ 1. MOUVEMENT FINANCIER (un seul créé)                               │
    │    - compteId: SOURCE                                               │
    │    - sens: "DEBIT"                                                  │
    │    - typePaiement: "INTERNAL_TRANSFER"                              │
    │    - metadata.compteDestId: DESTINATION                             │
    └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │ 2. TRANSACTIONS COMPTE (deux créées)                                │
    │                                                                     │
    │    SOURCE:                        DESTINATION:                      │
    │    ┌─────────────────────┐        ┌─────────────────────┐          │
    │    │ compteId: SOURCE    │        │ compteId: DEST      │          │
    │    │ mouvementId: M1     │───────▶│ mouvementId: M1     │ ← MÊME!  │
    │    │ typePaiement:       │        │ typePaiement:       │          │
    │    │   "TRANSFER_OUT"    │        │   "TRANSFER_IN"     │          │
    │    │ observations:       │        │ observations:       │          │
    │    │   "Virement vers X" │        │   "Virement depuis Y"│         │
    │    └─────────────────────┘        └─────────────────────┘          │
    └─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
    ┌─────────────────────────────────────────────────────────────────────┐
    │ 3. REQUÊTE HISTORIQUE (getCompteTransactions)                       │
    │                                                                     │
    │    SELECT ... FROM transactions_compte                              │
    │    LEFT JOIN mouvements_financiers ON mouvementId                   │
    │                                                                     │
    │    PROBLÈME: sens vient du mouvement (DEBIT)                        │
    │    Donc TRANSFER_IN affiche DEBIT au lieu de CREDIT                 │
    └─────────────────────────────────────────────────────────────────────┘
```

---

## 3. ANALYSE DÉTAILLÉE DES PROBLÈMES

### 3.1 BUG CRITIQUE: Sens incorrect pour TRANSFER_IN

**Fichier:** `server/services/comptes.ts` - fonction `getCompteTransactions()`

**Code actuel (lignes 1097-1130):**
```typescript
const rawResult = await db
  .select({
    // ...
    sens: mouvementsFinanciers.sens,  // ← PROBLÈME: Sens du mouvement SOURCE
    typePaiement: transactionsCompte.typePaiement,
    // ...
  })
  .from(transactionsCompte)
  .leftJoin(mouvementsFinanciers, eq(transactionsCompte.mouvementId, mouvementsFinanciers.id))
  // ...

const data = items.map(t => ({
  ...t,
  sens: t.sens || 'DEBIT',  // ← Fallback DEBIT si null
  // ...
}));
```

**Problème:**
- Pour un TRANSFER_IN, le `mouvementId` pointe vers le mouvement du compte SOURCE
- Ce mouvement a `sens: "DEBIT"` (sortie du compte source)
- L'historique du compte DESTINATION affiche donc "DEBIT" alors que l'argent est ENTRÉ

**Solution proposée:**
```typescript
// Dériver le sens à partir du typePaiement, pas du mouvement
import { isDepositType, isWithdrawalType } from '@shared/enum/status-constants';

const data = items.map(t => {
  // Déterminer le sens correct basé sur le type d'opération
  let derivedSens: 'CREDIT' | 'DEBIT';

  if (isDepositType(t.typePaiement) ||
      t.typePaiement === 'TRANSFER_IN' ||
      t.typePaiement === 'INTEREST_PAYMENT' ||
      t.typePaiement === 'CREDIT_DISBURSEMENT' ||
      t.typePaiement === 'TONTINE_WITHDRAWAL') {
    derivedSens = 'CREDIT';
  } else {
    derivedSens = 'DEBIT';
  }

  return {
    ...t,
    sens: derivedSens,
    // ...
  };
});
```

### 3.2 Libellés Non-Bancaires

**Situation actuelle:**
- Affiche: `"TRANSFER_OUT"`, `"DEPOSIT_SAVINGS"`, `"WITHDRAWAL_CURRENT"`
- Utilisateur voit des codes techniques

**Solution: Mapping vers libellés bancaires**

```typescript
// shared/config/transaction-labels.ts

export const TRANSACTION_LABELS: Record<string, (metadata?: any) => string> = {
  // Virements
  TRANSFER_OUT: (m) => `VIR ÉMIS${m?.compteDestNumero ? ` vers ${m.compteDestNumero}` : ''}`,
  TRANSFER_IN: (m) => `VIR REÇU${m?.compteSourceNumero ? ` de ${m.compteSourceNumero}` : ''}`,
  INTERNAL_TRANSFER: () => 'VIR INTERNE',

  // Dépôts
  DEPOSIT_SAVINGS: () => 'VERSEMENT ÉPARGNE',
  DEPOSIT_CURRENT: () => 'VERSEMENT COURANT',
  DEPOSIT_BLOCKED: () => 'VERSEMENT BLOQUÉ',
  INITIAL_DEPOSIT: () => 'VERSEMENT INITIAL OUVERTURE',
  SAVINGS_DEPOSIT: () => 'VERSEMENT ÉPARGNE',

  // Retraits
  WITHDRAWAL_SAVINGS: () => 'RETRAIT ÉPARGNE',
  WITHDRAWAL_CURRENT: () => 'RETRAIT COURANT',
  WITHDRAWAL_BLOCKED: () => 'RETRAIT BLOQUÉ',
  SAVINGS_WITHDRAWAL: () => 'RETRAIT ÉPARGNE',

  // Crédits
  CREDIT_REPAYMENT: (m) => `REMB. CRÉDIT${m?.numeroCredit ? ` N°${m.numeroCredit}` : ''}`,
  LOAN_REPAYMENT: (m) => `REMB. PRÊT${m?.numeroCredit ? ` N°${m.numeroCredit}` : ''}`,
  CREDIT_DISBURSEMENT: (m) => `DÉCAISSEMENT CRÉDIT${m?.numeroCredit ? ` N°${m.numeroCredit}` : ''}`,
  ENGAGEMENT_FEE: () => 'FRAIS ENGAGEMENT CRÉDIT',

  // Tontines
  TONTINE_CONTRIBUTION: (m) => `COTISATION TONTINE${m?.tontineName ? ` ${m.tontineName}` : ''}`,
  TONTINE_WITHDRAWAL: (m) => `BÉNÉFICE TONTINE${m?.tontineName ? ` ${m.tontineName}` : ''}`,

  // Intérêts
  INTEREST_PAYMENT: () => 'INTÉRÊTS CRÉDITEURS',

  // Coffre
  SAFE_SUPPLY: () => 'APPROVISIONNEMENT COFFRE',
  SAFE_DEPOSIT: () => 'DÉPÔT COFFRE',

  // Ajustements
  ADJUSTMENT: (m) => `RÉGULARISATION${m?.motif ? ` - ${m.motif}` : ''}`,
  LIQUIDATION: () => 'CLÔTURE COMPTE',

  // Frais
  BANK_FEE: () => 'FRAIS BANCAIRES',

  // Mobile Money
  MOBILE_MONEY_DEPOSIT: () => 'DÉPÔT MOBILE MONEY',
  MOBILE_MONEY_WITHDRAWAL: () => 'RETRAIT MOBILE MONEY',
};

export function getTransactionLabel(typePaiement: string, metadata?: any): string {
  const labelFn = TRANSACTION_LABELS[typePaiement];
  if (labelFn) {
    return labelFn(metadata);
  }
  // Fallback: humanize le code
  return typePaiement
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}
```

---

## 4. MATRICE DE COUVERTURE - FICHIERS

### 4.1 Services Backend

| Fichier | Rôle | Gère Sens | Gère Labels | Status |
|---------|------|-----------|-------------|--------|
| `server/services/ledger.ts` | Création mouvements | ✅ Passé en param | ❌ Non | OK |
| `server/services/comptes.ts` | Opérations compte | ✅ Via ledger | ❌ Non | ⚠️ Bug sens |
| `server/services/scheduled-transfers-service.ts` | Virements programmés | ⚠️ 1 seul sens | ❌ Non | ⚠️ Design |
| `server/services/balance-service.ts` | Lecture soldes | N/A | N/A | OK |
| `server/services/coffre/transfer-executor.ts` | Transferts coffre | ✅ Dual (D+C) | ❌ Non | OK |
| `server/services/transfert-inter-coffres/transfer-executor.ts` | Inter-agences | ✅ Dual (D+C) | ❌ Non | OK |

### 4.2 Routes API

| Route | Fichier | Retourne Sens | Retourne Labels | Status |
|-------|---------|---------------|-----------------|--------|
| `GET /api/comptes/:id/transactions` | `routes/comptes.ts` | ❌ Sens mouvement | ❌ Code brut | ⚠️ Bug |
| `GET /api/client-activities` | `routes/clients.ts` | ? | ? | À vérifier |
| `GET /api/mouvements` | `routes/finance.ts` | ✅ | ❌ | OK |

### 4.3 Composants Frontend

| Composant | Utilise Sens | Affiche Label | Source Données | Status |
|-----------|--------------|---------------|----------------|--------|
| `AccountHistory.tsx` | ✅ Filtrage | ❌ Code brut | `/api/comptes/:id/transactions` | ⚠️ Bug hérité |
| `ClientHistory.tsx` | ✅ Via type | ❌ | `/api/client-activities` | OK |
| `ClientGlobalHistory.tsx` | ✅ | ❌ | `/api/clients/:id/global-history` | OK |
| `TransactionHistoryPage.tsx` | ✅ | ❌ | `/api/mouvements` | OK |

---

## 5. RECOMMANDATIONS

### 5.1 Corrections Immédiates (Priorité Haute)

#### A. Fixer le sens dans getCompteTransactions()

**Fichier:** `server/services/comptes.ts`

```typescript
// Ligne ~1121-1130, remplacer par:

const CREDIT_TYPES = new Set([
  'TRANSFER_IN', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT', 'DEPOSIT_BLOCKED',
  'INITIAL_DEPOSIT', 'SAVINGS_DEPOSIT', 'INTEREST_PAYMENT', 'CREDIT_DISBURSEMENT',
  'TONTINE_WITHDRAWAL', 'MOBILE_MONEY_DEPOSIT'
]);

const data = items.map(t => {
  const sens = CREDIT_TYPES.has(t.typePaiement || '') ? 'CREDIT' : 'DEBIT';
  const description = t.observations || getTransactionLabel(t.typePaiement, t.metadata);

  return {
    ...t,
    sens,
    type: t.typePaiement,
    description,
  };
});
```

#### B. Ajouter mapping labels

**Nouveau fichier:** `shared/config/transaction-labels.ts`
- Créer le mapping complet (voir section 3.2)

### 5.2 Améliorations Moyen Terme

1. **Enrichir metadata des virements** avec numéros de compte source/dest
2. **Ajouter tests unitaires** pour chaque type d'opération
3. **Créer endpoint de réconciliation** pour vérifier cohérence sens/type

### 5.3 Architecture Long Terme

1. **Créer 2 mouvements pour les virements** (DEBIT source + CREDIT dest)
2. **Stocker sens directement dans transactionsCompte**
3. **Utiliser event sourcing** pour traçabilité complète

---

## 6. TESTS DE VALIDATION

### 6.1 Scénarios à Tester

| Scénario | Compte | Type Attendu | Sens Attendu | Vérification |
|----------|--------|--------------|--------------|--------------|
| Virement émis | Source | TRANSFER_OUT | DEBIT | Solde diminue |
| Virement reçu | Destination | TRANSFER_IN | CREDIT | Solde augmente |
| Dépôt espèces | Compte | DEPOSIT_* | CREDIT | Solde augmente |
| Retrait espèces | Compte | WITHDRAWAL_* | DEBIT | Solde diminue |
| Intérêts | Compte | INTEREST_PAYMENT | CREDIT | Solde augmente |
| Remboursement | Compte | CREDIT_REPAYMENT | DEBIT | Solde diminue |

### 6.2 Requête SQL de Vérification

```sql
-- Vérifier les transactions avec sens incorrect
SELECT
  tc.id,
  tc.compte_id,
  tc.type_paiement,
  tc.montant,
  mf.sens as sens_mouvement,
  CASE
    WHEN tc.type_paiement IN ('TRANSFER_IN', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT',
                               'DEPOSIT_BLOCKED', 'INITIAL_DEPOSIT', 'INTEREST_PAYMENT',
                               'CREDIT_DISBURSEMENT', 'TONTINE_WITHDRAWAL')
    THEN 'CREDIT'
    ELSE 'DEBIT'
  END as sens_attendu,
  CASE
    WHEN mf.sens != (CASE
      WHEN tc.type_paiement IN ('TRANSFER_IN', 'DEPOSIT_SAVINGS', 'DEPOSIT_CURRENT',
                                 'DEPOSIT_BLOCKED', 'INITIAL_DEPOSIT', 'INTEREST_PAYMENT',
                                 'CREDIT_DISBURSEMENT', 'TONTINE_WITHDRAWAL')
      THEN 'CREDIT' ELSE 'DEBIT' END)
    THEN 'INCOHÉRENT'
    ELSE 'OK'
  END as status
FROM transactions_compte tc
LEFT JOIN mouvements_financiers mf ON tc.mouvement_id = mf.id
WHERE tc.type_paiement IN ('TRANSFER_IN', 'TRANSFER_OUT')
ORDER BY tc.created_at DESC
LIMIT 100;
```

---

## 7. PLAN D'ACTION

| Phase | Action | Effort | Impact |
|-------|--------|--------|--------|
| 1 | Fixer derivation sens dans getCompteTransactions | 1h | Critique |
| 2 | Créer fichier transaction-labels.ts | 2h | UX majeur |
| 3 | Intégrer labels dans API response | 1h | UX majeur |
| 4 | Mettre à jour AccountHistory.tsx | 30min | UX |
| 5 | Tests unitaires | 2h | Qualité |
| 6 | Tests E2E virements | 2h | Qualité |

**Total estimé:** ~8h de développement

---

## 8. ANNEXES

### A. Liste complète TypePaiement

```
DEPOSIT_SAVINGS, DEPOSIT_CURRENT, DEPOSIT_BLOCKED, INITIAL_DEPOSIT, SAVINGS_DEPOSIT,
WITHDRAWAL_SAVINGS, WITHDRAWAL_CURRENT, WITHDRAWAL_BLOCKED, SAVINGS_WITHDRAWAL,
TRANSFER_IN, TRANSFER_OUT, INTERNAL_TRANSFER,
CREDIT_REPAYMENT, LOAN_REPAYMENT, CREDIT_DISBURSEMENT, ENGAGEMENT_FEE,
TONTINE_CONTRIBUTION, TONTINE_WITHDRAWAL,
INTEREST_PAYMENT, ADJUSTMENT, LIQUIDATION, BANK_FEE,
SAFE_SUPPLY, SAFE_DEPOSIT, CASH_TRANSFER,
MISC_COLLECTION, MISC_DISBURSEMENT,
MOBILE_MONEY_DEPOSIT, MOBILE_MONEY_WITHDRAWAL
```

### B. Références Code

- Ledger: [server/services/ledger.ts](server/services/ledger.ts)
- Comptes: [server/services/comptes.ts](server/services/comptes.ts)
- Virements: [server/services/scheduled-transfers-service.ts](server/services/scheduled-transfers-service.ts)
- Enums: [shared/enum/status-constants.ts](shared/enum/status-constants.ts)
- History UI: [client/src/components/client/AccountHistory.tsx](client/src/components/client/AccountHistory.tsx)
