# 🏦 Architecture Transactionnelle Unifiée - Cofinco

## Vue d'ensemble

Le système Cofinco implémente une architecture transactionnelle centralisée basée sur le pattern **"Grand Livre"** (Ledger) garantissant:

- ✅ **ACID Compliance** via transactions PostgreSQL
- ✅ **Point d'entrée unique** pour toutes les opérations de guichet
- ✅ **Traçabilité complète** de tous les mouvements de caisse
- ✅ **Comptabilité double-entrée** automatique
- ✅ **Validation de sécurité** (session caisse active, fonds suffisants)

---

## 📊 Diagramme de Flux

```
┌─────────────────────────────────────────────────────────────┐
│          Frontend: CaissePaiementModal.tsx                  │
│  (Formulaire universel pour toutes les transactions)       │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   │ POST /api/transactions/process
                   │ { clientId, amount, paymentMethod,
                   │   natureOperation, targetId, ... }
                   ▼
┌─────────────────────────────────────────────────────────────┐
│         Route: /api/transactions/process                    │
│         File: server/routes/transactions.ts                 │
│  - Validation Zod du payload                                │
│  - requireAuth middleware                                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│    Service Orchestrateur: GlobalTransactionService          │
│    File: server/services/global-transaction-service.ts      │
│                                                              │
│  1️⃣  Validation Préalable                                   │
│     • Vérification montant > 0                              │
│     • Vérification client existe                            │
│     • Si CASH: SessionCaisse OPEN requise                   │
│     • Si sortie: Vérification solde caisse >= montant       │
│                                                              │
│  2️⃣  Routage par Nature d'Opération (Switch)                │
│     ┌──────────────────────────────────────┐               │
│     │ TONTINE_CONTRIBUTION                 │               │
│     │ → processTontineContribution()       │               │
│     │   • Dispatcher intelligent           │               │
│     │   • Pénalités → Tours retard → Tour  │               │
│     │   • Met à jour solde tontine         │               │
│     │   • Crée operationsCaisse ✅         │               │
│     └──────────────────────────────────────┘               │
│                                                              │
│     ┌──────────────────────────────────────┐               │
│     │ TONTINE_WITHDRAWAL                   │               │
│     │ → processTontineDistribution()       │               │
│     │   • Débite solde tontine             │               │
│     │   • Débite session caisse            │               │
│     │   • Crée operationsCaisse ✅         │               │
│     └──────────────────────────────────────┘               │
│                                                              │
│     ┌──────────────────────────────────────┐               │
│     │ DEPOSIT_SAVINGS / CURRENT / BLOCKED  │               │
│     │ → processCompteDepot()               │               │
│     │   • Crédite compte                   │               │
│     │   • Crédite session caisse           │               │
│     │   • Crée transactionsCompte          │               │
│     │   • Crée operationsCaisse ✅ (NEW!)  │               │
│     └──────────────────────────────────────┘               │
│                                                              │
│     ┌──────────────────────────────────────┐               │
│     │ WITHDRAWAL_SAVINGS / CURRENT / BLOCKED│              │
│     │ → processCompteRetrait()             │               │
│     │   • Débite compte                    │               │
│     │   • Débite session caisse            │               │
│     │   • Crée transactionsCompte          │               │
│     │   • Crée operationsCaisse ✅ (NEW!)  │               │
│     └──────────────────────────────────────┘               │
│                                                              │
│     ┌──────────────────────────────────────┐               │
│     │ MISC_COLLECTION / DISBURSEMENT       │               │
│     │ → Logique inline                     │               │
│     │   • Met à jour session caisse        │               │
│     │   • Crée operationsCaisse ✅         │               │
│     └──────────────────────────────────────┘               │
│                                                              │
│  3️⃣  Transaction ACID via executeWithLedger                 │
│     • Création mouvementFinancier (Grand Livre)            │
│     • Exécution atomique de toutes les opérations          │
│     • Rollback automatique en cas d'erreur                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Règle d'Or Comptable

> **Toute opération en ESPÈCES (CASH) doit obligatoirement:**
> 1. Passer par une `SessionCaisse` active
> 2. Créer un `mouvementFinancier` (source de vérité)
> 3. Créer une `operationCaisse` (pour l'historique guichet)
> 4. Mettre à jour le `solde` de la session

**Entrée d'argent (Encaissement):**
- ✅ Augmente `sessionsCaisse.montantFermetureTheorique`
- ✅ Crédite le compte/portefeuille client (Passif)
- ✅ Enregistre dans `operationsCaisse` avec `typeOperation = XXX_DEPOSIT`

**Sortie d'argent (Décaissement):**
- ✅ Diminue `sessionsCaisse.montantFermetureTheorique`
- ✅ Débite le compte/portefeuille client
- ✅ Enregistre dans `operationsCaisse` avec `typeOperation = XXX_WITHDRAWAL`

---

## 📡 API Endpoint

### POST `/api/transactions/process`

**Headers:**
```http
Authorization: Bearer <token>
Content-Type: application/json
```

**Payload:**
```typescript
{
  "clientId": "uuid",              // Requis
  "amount": 50000,                  // Requis (> 0)
  "paymentMethod": "CASH" | "MOMO" | "TRANSFER", // Requis
  "natureOperation": "TONTINE_CONTRIBUTION" | "DEPOSIT_SAVINGS" | ..., // Requis

  // Cibles (selon l'opération)
  "targetId": "uuid",              // Optionnel (alias universel)
  "tontineId": "uuid",             // Pour opérations tontine
  "membreId": "uuid",              // Pour retrait tontine
  "compteId": "uuid",              // Pour opérations comptes
  "creditId": "uuid",              // Pour opérations crédit

  // Métadonnées
  "description": "Commentaire...", // Optionnel
  "referenceExterne": "REF-123",   // Optionnel (pour virements)
  "numeroTransaction": "TX-456",   // Optionnel (pour mobile money)
  "numeroTelephone": "237690..."   // Optionnel (pour mobile money)
}
```

**Response Success (200):**
```json
{
  "mouvement": {
    "id": "uuid",
    "reference": "MVT-2024-001",
    "montant": "50000",
    "sens": "CREDIT",
    "dateOperation": "2024-01-15T10:30:00Z"
  },
  "result": {
    "id": "uuid",
    "montant": "50000",
    "soldeApres": "150000",
    ...
  }
}
```

**Response Error (400/404/500):**
```json
{
  "error": "Fonds insuffisants en caisse. Disponible: 30000"
}
```

---

## 🎯 Types d'Opérations Supportées

### 1. Tontines
| Nature d'Opération | Direction | Service Appelé |
|-------------------|-----------|----------------|
| `TONTINE_CONTRIBUTION` | Entrée | `processTontineContribution()` |
| `TONTINE_WITHDRAWAL` | Sortie | `processTontineDistribution()` |

### 2. Comptes Épargne
| Nature d'Opération | Direction | Service Appelé |
|-------------------|-----------|----------------|
| `DEPOSIT_SAVINGS` | Entrée | `processCompteDepot()` |
| `DEPOSIT_CURRENT` | Entrée | `processCompteDepot()` |
| `DEPOSIT_BLOCKED` | Entrée | `processCompteDepot()` |
| `WITHDRAWAL_SAVINGS` | Sortie | `processCompteRetrait()` |
| `WITHDRAWAL_CURRENT` | Sortie | `processCompteRetrait()` |
| `WITHDRAWAL_BLOCKED` | Sortie | `processCompteRetrait()` |

### 3. Crédits
| Nature d'Opération | Direction | Service Appelé |
|-------------------|-----------|----------------|
| `LOAN_REPAYMENT` | Entrée | _À implémenter_ |
| `CREDIT_DISBURSEMENT` | Sortie | _À implémenter_ |

### 4. Divers
| Nature d'Opération | Direction | Description |
|-------------------|-----------|-------------|
| `MISC_COLLECTION` | Entrée | Encaissement divers (ex: vente carnets) |
| `MISC_DISBURSEMENT` | Sortie | Décaissement divers (ex: achat fournitures) |

---

## 🗄️ Structure des Tables

### `mouvementsFinanciers` (Grand Livre)
Source de vérité unique pour tous les mouvements d'argent.

```sql
CREATE TABLE mouvements_financiers (
  id UUID PRIMARY KEY,
  reference VARCHAR UNIQUE NOT NULL,
  source_module VARCHAR NOT NULL, -- "TONTINE" | "EPARGNE" | "CREDIT" | "CAISSE"
  sens VARCHAR NOT NULL,           -- "CREDIT" | "DEBIT"
  montant DECIMAL NOT NULL,
  date_operation TIMESTAMP NOT NULL,

  -- Relations
  client_id UUID REFERENCES clients(id),
  compte_id UUID REFERENCES comptes(id),
  tontine_id UUID REFERENCES tontines(id),
  credit_id UUID REFERENCES credits(id),
  session_caisse_id UUID REFERENCES sessions_caisse(id),

  -- Paiement
  methode_paiement VARCHAR,
  type_paiement VARCHAR,
  statut VARCHAR DEFAULT 'POSTED',

  created_at TIMESTAMP DEFAULT NOW()
);
```

### `operationsCaisse` (Historique Guichet)
Journal de toutes les opérations effectuées au guichet.

```sql
CREATE TABLE operations_caisse (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES sessions_caisse(id),
  mouvement_id UUID REFERENCES mouvements_financiers(id),

  type_operation VARCHAR NOT NULL, -- TypeOperationCaisse enum
  montant DECIMAL NOT NULL,
  methode_paiement VARCHAR NOT NULL,
  reference VARCHAR,
  description TEXT,

  client_id UUID REFERENCES clients(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### `sessionsCaisse` (Sessions Guichet)
```sql
CREATE TABLE sessions_caisse (
  id UUID PRIMARY KEY,
  caissier_id UUID NOT NULL REFERENCES users(id),

  montant_ouverture DECIMAL NOT NULL,
  montant_fermeture_theorique DECIMAL, -- Calculé en temps réel
  montant_fermeture_reel DECIMAL,      -- Saisi à la fermeture

  statut VARCHAR NOT NULL, -- "OPEN" | "CLOSED" | ...
  opened_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);
```

---

## 🛡️ Sécurité et Validations

### 1. Validation de Session Caisse (CASH uniquement)
```typescript
// GlobalTransactionService.process() lignes 82-116
if (payload.paymentMethod === MethodePaiement.CASH) {
  const session = await db.query.sessionsCaisse.findFirst({
    where: and(
      eq(sessionsCaisse.caissierId, userId),
      eq(sessionsCaisse.statut, StatutSessionCaisse.OPEN)
    )
  });

  if (!session) {
    throw new Error("Aucune session de caisse ouverte pour cet agent");
  }
}
```

### 2. Validation Fonds Suffisants (Sorties CASH)
```typescript
// GlobalTransactionService.process() lignes 101-115
const isSortie = [
  TypeOperationCaisse.TONTINE_WITHDRAWAL,
  TypeOperationCaisse.WITHDRAWAL_SAVINGS,
  // ...
].includes(payload.natureOperation);

if (isSortie) {
  const soldeActuel = Number(session.montantFermetureTheorique || 0);
  if (soldeActuel < payload.amount) {
    throw new Error(`Fonds insuffisants en caisse. Disponible: ${soldeActuel}`);
  }
}
```

### 3. Validation Solde Compte (Retraits)
```typescript
// comptes.ts lignes 565-571
const soldeCourant = parseFloat(compte.soldeCourant || "0");
if (soldeCourant < data.montant) {
  throw new Error(
    `Solde insuffisant. Disponible: ${soldeCourant}, Demandé: ${data.montant}`
  );
}
```

### 4. Sanitization des Inputs
```typescript
// Frontend: CaissePaiementModal.tsx ligne 386
description: sanitizeInput(formData.description)
```

---

## 🔄 Corrections Apportées

### Problème Identifié (2024-01-24)
Les opérations de **dépôt** et **retrait** sur comptes d'épargne ne créaient **PAS** d'entrées dans `operationsCaisse`, donc elles n'apparaissaient pas dans l'historique de caisse.

### Solution Implémentée
Ajout de la création d'`operationsCaisse` dans:

**1. `processCompteDepot()` (comptes.ts:476-523)**
```typescript
// IMPORTANT: Create operation caisse for cash transactions
if (sessionCaisseId && methodePaiement === "CASH") {
  const { validateUserId } = await import("./ledger");
  const validatedUserId = await validateUserId(tx, userId);

  await tx.insert(operationsCaisse).values({
    sessionId: sessionCaisseId,
    mouvementId: mouvement.id,
    typeOperation: typePaiement as any,
    montant: montant.toString(),
    methodePaiement: "CASH" as any,
    reference: `EPG-${mouvement.reference}`,
    description: observations || `Dépôt compte ${typePaiement.replace('DEPOSIT_', '')}`,
    createdBy: validatedUserId,
  });
}
```

**2. `processCompteRetrait()` (comptes.ts:636-683)**
```typescript
// IMPORTANT: Create operation caisse for cash transactions
if (sessionCaisseId && methodePaiement === "CASH") {
  const { validateUserId } = await import("./ledger");
  const validatedUserId = await validateUserId(tx, userId);

  await tx.insert(operationsCaisse).values({
    sessionId: sessionCaisseId,
    mouvementId: mouvement.id,
    typeOperation: typePaiement as any,
    montant: montant.toString(),
    methodePaiement: "CASH" as any,
    reference: `EPG-${mouvement.reference}`,
    description: observations || `Retrait compte ${typePaiement.replace('WITHDRAWAL_', '')}`,
    createdBy: validatedUserId,
  });
}
```

---

## ✅ État d'Implémentation

| Module | Statut | Historique Caisse |
|--------|--------|-------------------|
| Tontines (Cotisation) | ✅ Complet | ✅ Tracé |
| Tontines (Retrait) | ✅ Complet | ✅ Tracé |
| Comptes (Dépôt) | ✅ Complet | ✅ **Tracé (Corrigé!)** |
| Comptes (Retrait) | ✅ Complet | ✅ **Tracé (Corrigé!)** |
| Divers (Encaissement) | ✅ Complet | ✅ Tracé |
| Divers (Décaissement) | ✅ Complet | ✅ Tracé |
| Crédits (Remboursement) | ⏳ À faire | - |
| Crédits (Décaissement) | ⏳ À faire | - |

---

## 🧪 Testing

### Test Manuel 1: Dépôt Épargne
```bash
curl -X POST http://localhost:5000/api/transactions/process \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "client-uuid",
    "amount": 50000,
    "paymentMethod": "CASH",
    "natureOperation": "DEPOSIT_SAVINGS",
    "compteId": "compte-uuid",
    "description": "Dépôt mensuel"
  }'
```

**Vérification:**
```sql
-- 1. Vérifier mouvementFinancier créé
SELECT * FROM mouvements_financiers
WHERE client_id = 'client-uuid'
ORDER BY created_at DESC LIMIT 1;

-- 2. Vérifier transactionCompte créée
SELECT * FROM transactions_compte
WHERE compte_id = 'compte-uuid'
ORDER BY created_at DESC LIMIT 1;

-- 3. ✅ Vérifier operationCaisse créée (NOUVEAU!)
SELECT * FROM operations_caisse
WHERE session_id = 'session-uuid'
ORDER BY created_at DESC LIMIT 1;

-- 4. Vérifier solde caisse mis à jour
SELECT montant_fermeture_theorique
FROM sessions_caisse
WHERE id = 'session-uuid';
```

---

## 📚 Références Code

### Fichiers Principaux
- **Service Orchestrateur:** [`server/services/global-transaction-service.ts`](server/services/global-transaction-service.ts)
- **Route API:** [`server/routes/transactions.ts`](server/routes/transactions.ts)
- **Services Métier:**
  - Tontines: [`server/services/tontine-logic.ts`](server/services/tontine-logic.ts)
  - Comptes: [`server/services/comptes.ts`](server/services/comptes.ts)
- **Frontend:** [`client/src/components/finance/caisse/CaissePaiementModal.tsx`](client/src/components/finance/caisse/CaissePaiementModal.tsx)
- **API Client:** [`client/src/lib/api-client.ts`](client/src/lib/api-client.ts) (ligne 1993-1998)

### Enums & Constantes
- [`shared/enum/status-constants.ts`](shared/enum/status-constants.ts)
  - `TypeOperationCaisse` (lignes 586-622)
  - `MethodePaiement` (lignes 451-458)
  - `StatutSessionCaisse` (lignes 1640-1659)

---

## 🚀 Prochaines Étapes

### 1. Implémenter Module Crédits
- `LOAN_REPAYMENT` → Encaissement remboursement
- `CREDIT_DISBURSEMENT` → Décaissement du prêt
- S'assurer de créer `operationsCaisse` pour les transactions CASH

### 2. Tests Automatisés
```typescript
// tests/global-transaction.test.ts
describe('GlobalTransactionService', () => {
  it('should create operationCaisse for CASH deposits', async () => {
    const result = await GlobalTransactionService.process(userId, {
      clientId: 'test-client',
      amount: 10000,
      paymentMethod: 'CASH',
      natureOperation: 'DEPOSIT_SAVINGS',
      compteId: 'test-compte'
    });

    const operation = await db.query.operationsCaisse.findFirst({
      where: eq(operationsCaisse.mouvementId, result.mouvement.id)
    });

    expect(operation).toBeDefined();
    expect(operation.montant).toBe('10000');
  });
});
```

### 3. Dashboard Caisse Temps Réel
Afficher un widget temps réel sur le dashboard agent:
- Solde caisse actuel
- Nombre d'opérations aujourd'hui
- Dernières 5 transactions

---

**Auteur:** Brandon (Architecte Senior Fintech)
**Date:** 2024-01-24
**Version:** 1.0 (Production-Ready)
